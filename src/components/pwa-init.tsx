"use client";

/**
 * PWA başlatma ve arka plan konum takibi.
 *
 * - Service Worker kaydeder.
 * - Supabase yapılandırmasını IndexedDB'ye yazar (SW bu verileri kullanır).
 * - Kullanıcı giriş yaptıysa konum izni ister ve Periodic Background Sync kaydeder.
 * - Uygulama açıkken her 20 dakikada bir aktif konum alır.
 * - SW'den gelen konum isteklerini karşılar (MessageChannel).
 */

import { useEffect } from "react";

const DB_NAME = "bakalim-config";
const DB_VERSION = 1;
const CONFIG_STORE = "config";

// ── IndexedDB yardımcıları ─────────────────────────────────────────────────

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
    req.onerror = (e) =>
      reject((e.target as IDBOpenDBRequest).error);
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

// ── Supabase yapılandırmasını IndexedDB'ye kaydet ──────────────────────────

async function storeSupabaseConfig(): Promise<void> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (url) await setConfig("supabaseUrl", url);
  if (key) await setConfig("anonKey", key);
}

// ── Supabase oturumunu IndexedDB'ye kaydet (SW için) ──────────────────────

async function storeAuthSession(): Promise<void> {
  try {
    const { createBrowserSupabaseClient } = await import("@/lib/supabase");
    const supabase = createBrowserSupabaseClient();
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (session) {
      await setConfig("authToken", session.access_token);
      await setConfig("userId", session.user.id);
    }
  } catch {
    // Supabase mevcut değil veya oturum yok
  }
}

// ── Konum → Supabase ───────────────────────────────────────────────────────

async function saveLocationToSupabase(
  coords: GeolocationCoordinates
): Promise<void> {
  try {
    const { createBrowserSupabaseClient } = await import("@/lib/supabase");
    const supabase = createBrowserSupabaseClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;

    await supabase.from("location_logs").insert({
      user_id: user.id,
      latitude: coords.latitude,
      longitude: coords.longitude,
      accuracy: coords.accuracy ?? null,
      recorded_at: new Date().toISOString(),
    });
  } catch {
    // Sessizce başarısız ol
  }
}

// ── Konum iznini location_permissions tablosuna kaydet ────────────────────

async function saveLocationPermission(
  geolocationGranted: boolean,
  periodicSyncSupported: boolean
): Promise<void> {
  try {
    const { createBrowserSupabaseClient } = await import("@/lib/supabase");
    const supabase = createBrowserSupabaseClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;

    await supabase.from("location_permissions").upsert(
      {
        user_id: user.id,
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

// ── Konum al ve kaydet ─────────────────────────────────────────────────────

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

async function trackLocationNow(): Promise<void> {
  try {
    const coords = await getCurrentLocation();
    await saveLocationToSupabase(coords);
    await storeAuthSession(); // Token'ı SW için taze tut
  } catch {
    // Sessizce başarısız ol
  }
}

// ── Periodic Background Sync kayıt ────────────────────────────────────────

async function registerPeriodicSync(
  registration: ServiceWorkerRegistration
): Promise<boolean> {
  if (!("periodicSync" in registration)) return false;

  try {
    const status = await navigator.permissions.query({
      // @ts-expect-error — periodic-background-sync henüz standart TS tiplerinde yok
      name: "periodic-background-sync",
    });

    if (status.state === "granted") {
      // @ts-expect-error — periodicSync henüz standart TS tiplerinde yok
      await registration.periodicSync.register("location-sync", {
        minInterval: 15 * 60 * 1000, // 15 dakika (tarayıcı daha uzun süre uygulayabilir)
      });
      console.log("[PWA] Periodic Background Sync kaydedildi.");
      return true;
    }
  } catch {
    // Desteklenmiyor (iOS, Firefox vb.)
  }
  return false;
}

// ── Ana bileşen ────────────────────────────────────────────────────────────

export function PwaInit() {
  useEffect(() => {
    if (typeof window === "undefined" || !("serviceWorker" in navigator)) return;

    let trackingTimer: ReturnType<typeof setInterval> | undefined;

    async function init() {
      // 1. Service Worker kaydet
      let registration: ServiceWorkerRegistration;
      try {
        registration = await navigator.serviceWorker.register("/sw.js", {
          scope: "/",
        });
        console.log("[PWA] Service Worker kaydedildi.");
      } catch (err) {
        console.warn("[PWA] Service Worker kaydı başarısız:", err);
        return;
      }

      // 2. SW'ye Supabase yapılandırmasını IndexedDB aracılığıyla ilet
      await storeSupabaseConfig();
      await storeAuthSession();

      // 3. SW'den gelen konum isteklerini karşıla (MessageChannel)
      navigator.serviceWorker.addEventListener(
        "message",
        async (event: MessageEvent) => {
          if (event.data?.type !== "REQUEST_LOCATION") return;
          const port = event.ports[0];
          if (!port) return;

          try {
            const coords = await getCurrentLocation();
            await saveLocationToSupabase(coords);
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
        }
      );

      // 4. İlk konum izni talebi (her cihazda yalnızca bir kez)
      const alreadyAsked = localStorage.getItem("location-permission-asked");
      if (!alreadyAsked) {
        try {
          const { createBrowserSupabaseClient } = await import("@/lib/supabase");
          const supabase = createBrowserSupabaseClient();
          const {
            data: { user },
          } = await supabase.auth.getUser();

          if (user) {
            localStorage.setItem("location-permission-asked", "1");

            // Konum iznini iste (tarayıcı izin dialogu gösterir)
            let geolocationGranted = false;
            try {
              const coords = await getCurrentLocation();
              await saveLocationToSupabase(coords);
              await storeAuthSession();
              geolocationGranted = true;
            } catch {
              // İzin reddedildi veya hata
            }

            // Periodic Background Sync kaydını dene
            const periodicSyncSupported = await registerPeriodicSync(
              registration
            );

            // İzin durumunu Supabase'e kaydet
            await saveLocationPermission(geolocationGranted, periodicSyncSupported);
          }
        } catch {
          // Supabase mevcut değil veya oturum yok — sonra tekrar dene
        }
      }

      // 5. Uygulama açıkken aktif konum takibi (her 20 dakika)
      trackingTimer = setInterval(() => {
        void trackLocationNow();
      }, 20 * 60 * 1000);

      // 6. Sayfa görünür olduğunda da konum al
      document.addEventListener("visibilitychange", () => {
        if (document.visibilityState === "visible") {
          void trackLocationNow();
        }
      });
    }

    void init();

    return () => {
      if (trackingTimer !== undefined) clearInterval(trackingTimer);
    };
  }, []);

  return null;
}
