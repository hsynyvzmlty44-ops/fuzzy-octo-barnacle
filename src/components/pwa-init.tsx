"use client";

/**
 * PWA başlatma, Service Worker kaydı ve konum izni banner'ı.
 *
 * iOS Safari / Chrome kısıtı: getCurrentPosition yalnızca bir kullanıcı
 * gesturünden (tıklama) çağrılabilir — otomatik tetiklenemez.
 * Bu yüzden izin durumu 'prompt' veya bilinmiyorsa ekranda bir banner
 * gösterilir. Kullanıcı butona basınca tarayıcı konum dialogunu açar.
 */

import { useEffect, useRef, useState } from "react";

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

// ── Permissions API (iOS'ta fırlatabilir) ─────────────────────────────────

async function queryGeolocationPermission(): Promise<PermissionState | "unknown"> {
  if (!navigator.permissions) return "unknown";
  try {
    const result = await navigator.permissions.query({ name: "geolocation" });
    return result.state;
  } catch {
    // iOS Safari bazı versiyonlarda fırlatır
    return "unknown";
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

// ── Supabase yazma işlemleri ───────────────────────────────────────────────

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
    /* sessizce başarısız ol */
  }
}

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
    /* sessizce başarısız ol */
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
    /* desteklenmiyor */
  }
  return false;
}

// ── Ana bileşen ────────────────────────────────────────────────────────────

export function PwaInit() {
  const [showBanner, setShowBanner] = useState(false);
  const [bannerLoading, setBannerLoading] = useState(false);

  const trackingTimerRef = useRef<ReturnType<typeof setInterval> | undefined>(undefined);
  const registrationRef = useRef<ServiceWorkerRegistration | undefined>(undefined);
  const userIdRef = useRef<string | undefined>(undefined);
  // Aktif takip başladı mı?
  const trackingStartedRef = useRef(false);

  // Aktif konum takibini başlat (bir kez)
  function startTracking(userId: string) {
    if (trackingStartedRef.current) return;
    trackingStartedRef.current = true;
    userIdRef.current = userId;

    trackingTimerRef.current = setInterval(async () => {
      try {
        const coords = await getCurrentLocation();
        await saveLocationToSupabase(coords, userId);
      } catch {
        /* sessizce başarısız ol */
      }
    }, 20 * 60 * 1000);
  }

  // Butona basılınca çalışır — kullanıcı gesturü gerektirir (iOS)
  async function handlePermissionRequest() {
    if (bannerLoading) return;
    setBannerLoading(true);

    const userId = userIdRef.current;
    let granted = false;

    try {
      const coords = await getCurrentLocation();
      if (userId) {
        await saveLocationToSupabase(coords, userId);
        startTracking(userId);
      }
      granted = true;
    } catch {
      /* reddedildi veya hata */
    }

    const periodicSyncSupported = registrationRef.current
      ? await registerPeriodicSync(registrationRef.current)
      : false;

    if (userId) {
      await saveLocationPermission(granted, periodicSyncSupported, userId);
    }

    setBannerLoading(false);
    setShowBanner(false);
  }

  function handleDismiss() {
    // Oturumda bir daha gösterme
    try {
      sessionStorage.setItem("location-banner-dismissed", "1");
    } catch {
      /* sessizce başarısız ol */
    }
    setShowBanner(false);
  }

  useEffect(() => {
    if (typeof window === "undefined" || !("serviceWorker" in navigator)) return;

    // 1. Service Worker kaydı
    navigator.serviceWorker
      .register("/sw.js", { scope: "/" })
      .then((reg) => {
        registrationRef.current = reg;
        return storeSupabaseConfig();
      })
      .catch((err) => console.warn("[PWA] SW kaydı başarısız:", err));

    // 2. SW'den gelen MessageChannel konum isteklerini karşıla
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

    // 3. Sayfa görünür olduğunda konum al
    const onVisibilityChange = async () => {
      if (document.visibilityState !== "visible") return;
      const uid = userIdRef.current;
      if (!uid) return;
      try {
        const coords = await getCurrentLocation();
        await saveLocationToSupabase(coords, uid);
      } catch {
        /* sessizce başarısız ol */
      }
    };
    document.addEventListener("visibilitychange", onVisibilityChange);

    // 4. Auth state dinle
    let authUnsub: (() => void) | undefined;

    import("@/lib/supabase")
      .then(({ createBrowserSupabaseClient }) => {
        const supabase = createBrowserSupabaseClient();

        const { data } = supabase.auth.onAuthStateChange((event, session) => {
          if (
            (event === "INITIAL_SESSION" || event === "SIGNED_IN") &&
            session
          ) {
            const userId = session.user.id;
            userIdRef.current = userId;

            void storeAuthSession(session.access_token, userId);
            void (async () => {
              const permState = await queryGeolocationPermission();

              if (permState === "granted") {
                // İzin zaten var — banner gösterme, sessizce takip et
                try {
                  const coords = await getCurrentLocation();
                  await saveLocationToSupabase(coords, userId);
                } catch {
                  /* sessizce başarısız ol */
                }
                startTracking(userId);
                return;
              }

              if (permState === "denied") {
                // Reddedilmiş — banner gösterme
                await saveLocationPermission(false, false, userId);
                return;
              }

              // 'prompt' veya 'unknown' (iOS) — banner göster
              // Oturumda zaten kapatıldıysa tekrar gösterme
              const dismissed = sessionStorage.getItem("location-banner-dismissed");
              if (!dismissed) {
                setShowBanner(true);
              }
            })();
          }

          if (event === "SIGNED_OUT") {
            userIdRef.current = undefined;
            trackingStartedRef.current = false;
            setShowBanner(false);
            if (trackingTimerRef.current !== undefined) {
              clearInterval(trackingTimerRef.current);
              trackingTimerRef.current = undefined;
            }
          }
        });

        authUnsub = data.subscription.unsubscribe;
      })
      .catch(() => {
        /* Supabase mevcut değil */
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

  if (!showBanner) return null;

  return (
    <div
      role="dialog"
      aria-label="Konum izni"
      className="fixed bottom-6 left-1/2 z-[100] w-[calc(100%-2rem)] max-w-sm -translate-x-1/2 rounded-2xl border border-white/15 bg-[#1e1433]/90 p-5 shadow-2xl backdrop-blur-2xl"
      style={{ paddingBottom: "max(1.25rem, env(safe-area-inset-bottom))" }}
    >
      {/* Kapatma butonu */}
      <button
        onClick={handleDismiss}
        aria-label="Kapat"
        className="absolute right-3 top-3 flex h-6 w-6 items-center justify-center rounded-full text-white/40 transition hover:text-white/70"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
          className="h-4 w-4"
          aria-hidden
        >
          <line x1="18" y1="6" x2="6" y2="18" />
          <line x1="6" y1="6" x2="18" y2="18" />
        </svg>
      </button>

      {/* İçerik */}
      <p className="mb-1 text-sm font-semibold text-white/90">
        Konum takibi
      </p>
      <p className="mb-4 text-xs leading-relaxed text-white/55">
        Arka planda konum paylaşımı için izin gerekiyor.
      </p>

      <button
        onClick={() => void handlePermissionRequest()}
        disabled={bannerLoading}
        className="flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-[#C8A2C8] via-[#d4b8e8] to-[#e9d5ff] px-4 py-2.5 text-sm font-semibold text-[#0F172A] shadow-md transition disabled:opacity-60"
      >
        {bannerLoading ? (
          <>
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
              className="h-4 w-4 animate-spin"
              aria-hidden
            >
              <path d="M21 12a9 9 0 1 1-6.219-8.56" />
            </svg>
            <span>Bekleniyor…</span>
          </>
        ) : (
          <>
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
              className="h-4 w-4"
              aria-hidden
            >
              <path d="M12 2a7 7 0 0 1 7 7c0 5.25-7 13-7 13S5 14.25 5 9a7 7 0 0 1 7-7z" />
              <circle cx="12" cy="9" r="2.5" />
            </svg>
            <span>Konum iznine izin ver</span>
          </>
        )}
      </button>
    </div>
  );
}
