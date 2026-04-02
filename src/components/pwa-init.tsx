"use client";

/**
 * PWA başlatma ve arka plan konum takibi.
 *
 * Temel akış:
 * 1. Sayfa ilk açıldığında Service Worker kaydedilir.
 * 2. supabase.auth.onAuthStateChange ile SIGNED_IN / INITIAL_SESSION dinlenir.
 * 3. Oturum algılandığında Permissions API'ye bakılır:
 *    - 'granted'  → sessizce konum al ve kaydet.
 *    - 'prompt'   → tarayıcı izin dialogunu göster (getCurrentPosition çağrısıyla).
 *    - 'denied'   → yapılabilecek bir şey yok.
 * 4. Uygulama açıkken her 20 dakikada bir ve sekme görünür olduğunda konum alınır.
 * 5. SW'den gelen MessageChannel konum istekleri karşılanır.
 *
 * NOT: useEffect layout'ta bir kez çalışır; login→dashboard navigasyonunda
 * yeniden çalışmaz. Bu yüzden onAuthStateChange kullanılır.
 */

import { useEffect, useRef } from "react";

const DB_NAME = "bakalim-config";
const DB_VERSION = 1;
const CONFIG_STORE = "config";

// ── IndexedDB ──────────────────────────────────────────────────────────────

function openConfigDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = (e) => {
      const db = (e.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(CONFIG_STORE)) {
        db.createObjectStore(CONFIG_STORE, { keyPath: "key" });
      }
    };
    req.onsuccess = (e) => resolve((e.target as IDBOpenDBRequest).result);
    req.onerror = (e) => reject((e.target as IDBOpenDBRequest).error);
  });
}

async function setConfig(key: string, value: string): Promise<void> {
  const db = await openConfigDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(CONFIG_STORE, "readwrite");
    tx.objectStore(CONFIG_STORE).put({ key, value });
    tx.oncomplete = () => resolve();
    tx.onerror = (e) => reject((e.target as IDBTransaction).error);
  });
}

// ── Supabase yapılandırmasını SW için IndexedDB'ye yaz ─────────────────────

async function storeSupabaseConfig(): Promise<void> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (url) await setConfig("supabaseUrl", url);
  if (key) await setConfig("anonKey", key);
}

async function storeAuthSession(token: string, userId: string): Promise<void> {
  await setConfig("authToken", token);
  await setConfig("userId", userId);
}

// ── Geolocation Permissions API ────────────────────────────────────────────

async function checkGeolocationPermission(): Promise<PermissionState> {
  if (!navigator.permissions) return "prompt";
  try {
    const result = await navigator.permissions.query({ name: "geolocation" });
    return result.state;
  } catch {
    return "prompt";
  }
}

// ── Konum alma ─────────────────────────────────────────────────────────────

function getCurrentLocation(): Promise<GeolocationCoordinates> {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error("Geolocation desteklenmiyor."));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve(pos.coords),
      (err) => reject(err),
      { timeout: 12000, maximumAge: 60000, enableHighAccuracy: false }
    );
  });
}

// ── Konum → Supabase ───────────────────────────────────────────────────────

async function saveLocationToSupabase(
  coords: GeolocationCoordinates,
  userId: string
): Promise<void> {
  try {
    const { createBrowserSupabaseClient } = await import("@/lib/supabase");
    const supabase = createBrowserSupabaseClient();
    await supabase.from("location_logs").insert({
      user_id: userId,
      latitude: coords.latitude,
      longitude: coords.longitude,
      accuracy: coords.accuracy ?? null,
      recorded_at: new Date().toISOString(),
    });
  } catch {
    // Sessizce başarısız ol
  }
}

// ── İzin durumunu Supabase'e kaydet ───────────────────────────────────────

async function saveLocationPermission(
  geolocationGranted: boolean,
  periodicSyncSupported: boolean,
  userId: string
): Promise<void> {
  try {
    const { createBrowserSupabaseClient } = await import("@/lib/supabase");
    const supabase = createBrowserSupabaseClient();
    await supabase.from("location_permissions").upsert(
      {
        user_id: userId,
        geolocation_granted: geolocationGranted,
        periodic_sync_supported: periodicSyncSupported,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id" }
    );
  } catch {
    // Sessizce başarısız ol
  }
}

// ── Periodic Background Sync ───────────────────────────────────────────────

async function registerPeriodicSync(
  registration: ServiceWorkerRegistration
): Promise<boolean> {
  if (!("periodicSync" in registration)) return false;
  try {
    const status = await navigator.permissions.query({
      // @ts-expect-error — henüz standart TS tiplerinde yok
      name: "periodic-background-sync",
    });
    if (status.state === "granted") {
      // @ts-expect-error — henüz standart TS tiplerinde yok
      await registration.periodicSync.register("location-sync", {
        minInterval: 15 * 60 * 1000,
      });
      return true;
    }
  } catch {
    // Desteklenmiyor
  }
  return false;
}

// ── Ana bileşen ────────────────────────────────────────────────────────────

export function PwaInit() {
  // Aktif takip interval'ını ref'te tut — auth değiştiğinde yönetmek için
  const trackingTimerRef = useRef<ReturnType<typeof setInterval> | undefined>(
    undefined
  );
  // Zaten izin işlemi çalışıyor mu?
  const permissionInProgressRef = useRef(false);
  // SW kaydı ref'i
  const registrationRef = useRef<ServiceWorkerRegistration | undefined>(
    undefined
  );

  useEffect(() => {
    if (typeof window === "undefined" || !("serviceWorker" in navigator)) return;

    // ── 1. Service Worker kaydı ──────────────────────────────────────────
    navigator.serviceWorker
      .register("/sw.js", { scope: "/" })
      .then((reg) => {
        registrationRef.current = reg;
        console.log("[PWA] Service Worker kaydedildi.");
        return storeSupabaseConfig();
      })
      .catch((err) => {
        console.warn("[PWA] Service Worker kaydı başarısız:", err);
      });

    // ── 2. SW'den gelen konum isteklerini karşıla (MessageChannel) ───────
    const onSwMessage = async (event: MessageEvent) => {
      if (event.data?.type !== "REQUEST_LOCATION") return;
      const port = event.ports[0];
      if (!port) return;
      try {
        const coords = await getCurrentLocation();
        port.postMessage({
          location: {
            latitude: coords.latitude,
            longitude: coords.longitude,
            accuracy: coords.accuracy,
          },
        });
      } catch (err) {
        port.postMessage({
          error: err instanceof Error ? err.message : "Konum alınamadı.",
        });
      }
    };
    navigator.serviceWorker.addEventListener("message", onSwMessage);

    // ── 3. Oturum değişikliklerini dinle ─────────────────────────────────
    async function onSignedIn(session: {
      access_token: string;
      user: { id: string };
    }) {
      // SW için token'ı sakla
      await storeAuthSession(session.access_token, session.user.id);

      const userId = session.user.id;

      // İzin işlemi zaten çalışıyorsa tekrar başlatma
      if (permissionInProgressRef.current) return;
      permissionInProgressRef.current = true;

      try {
        const permState = await checkGeolocationPermission();

        if (permState === "denied") {
          // Kullanıcı daha önce reddetmiş, yapacak bir şey yok
          await saveLocationPermission(false, false, userId);
        } else {
          // 'granted' veya 'prompt' — getCurrentPosition çağrısı:
          // 'prompt' durumunda tarayıcı izin dialogunu gösterir.
          // 'granted' durumunda sessizce alır.
          let granted = false;
          try {
            const coords = await getCurrentLocation();
            await saveLocationToSupabase(coords, userId);
            granted = true;
          } catch {
            // Reddedildi veya hata
          }

          const periodicSyncSupported = registrationRef.current
            ? await registerPeriodicSync(registrationRef.current)
            : false;

          await saveLocationPermission(granted, periodicSyncSupported, userId);
        }
      } finally {
        permissionInProgressRef.current = false;
      }

      // Aktif takip zaten başlamışsa yeniden başlatma
      if (trackingTimerRef.current !== undefined) return;

      // Her 20 dakikada bir konum al
      trackingTimerRef.current = setInterval(async () => {
        try {
          const coords = await getCurrentLocation();
          await saveLocationToSupabase(coords, userId);
        } catch {
          // Sessizce başarısız ol
        }
      }, 20 * 60 * 1000);
    }

    function onSignedOut() {
      if (trackingTimerRef.current !== undefined) {
        clearInterval(trackingTimerRef.current);
        trackingTimerRef.current = undefined;
      }
    }

    // Sayfa görünür olduğunda konum al (sekme öne gelince)
    const onVisibilityChange = async () => {
      if (document.visibilityState !== "visible") return;
      try {
        const { createBrowserSupabaseClient } = await import("@/lib/supabase");
        const supabase = createBrowserSupabaseClient();
        const {
          data: { session },
        } = await supabase.auth.getSession();
        if (!session) return;
        const coords = await getCurrentLocation();
        await saveLocationToSupabase(coords, session.user.id);
      } catch {
        // Sessizce başarısız ol
      }
    };
    document.addEventListener("visibilitychange", onVisibilityChange);

    // onAuthStateChange: INITIAL_SESSION (zaten giriş yapılmış) ve
    // SIGNED_IN (yeni giriş) eventlerini yakalar.
    let authUnsub: (() => void) | undefined;
    import("@/lib/supabase")
      .then(({ createBrowserSupabaseClient }) => {
        const supabase = createBrowserSupabaseClient();
        const { data } = supabase.auth.onAuthStateChange((event, session) => {
          if (
            (event === "INITIAL_SESSION" || event === "SIGNED_IN") &&
            session
          ) {
            void onSignedIn(session);
          }
          if (event === "SIGNED_OUT") {
            onSignedOut();
          }
        });
        authUnsub = data.subscription.unsubscribe;
      })
      .catch(() => {
        // Supabase mevcut değil
      });

    return () => {
      navigator.serviceWorker.removeEventListener("message", onSwMessage);
      document.removeEventListener("visibilitychange", onVisibilityChange);
      authUnsub?.();
      if (trackingTimerRef.current !== undefined) {
        clearInterval(trackingTimerRef.current);
      }
    };
  }, []);

  return null;
}
