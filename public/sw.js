/**
 * bakalım — Service Worker
 *
 * Periodic Background Sync ile konum takibi yapar.
 * NOT: Service Worker, Geolocation API'ye doğrudan erişemez.
 * Açık sekmelerden MessageChannel aracılığıyla konum ister.
 * Uygulama tamamen kapalıysa bu periyotta konum alınamaz — bu
 * web platformunun bir kısıtlamasıdır (iOS dahil tüm tarayıcılar).
 */

const DB_NAME = "bakalim-config";
const DB_VERSION = 1;
const CONFIG_STORE = "config";
const CACHE_NAME = "bakalim-v1";

// ── IndexedDB yardımcıları ─────────────────────────────────────────────────

function openConfigDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains(CONFIG_STORE)) {
        db.createObjectStore(CONFIG_STORE, { keyPath: "key" });
      }
    };
    req.onsuccess = (e) => resolve(e.target.result);
    req.onerror = (e) => reject(e.target.error);
  });
}

async function getConfig(key) {
  const db = await openConfigDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(CONFIG_STORE, "readonly");
    const req = tx.objectStore(CONFIG_STORE).get(key);
    req.onsuccess = (e) => resolve(e.target.result?.value ?? null);
    req.onerror = (e) => reject(e.target.error);
  });
}

// ── Supabase'e konum kaydet ────────────────────────────────────────────────

async function saveLocationToSupabase(location) {
  const [supabaseUrl, anonKey, authToken, userId] = await Promise.all([
    getConfig("supabaseUrl"),
    getConfig("anonKey"),
    getConfig("authToken"),
    getConfig("userId"),
  ]);

  if (!supabaseUrl || !anonKey || !userId) {
    console.log("[SW] Supabase yapılandırması eksik, konum kaydedilemiyor.");
    return;
  }

  const headers = {
    "Content-Type": "application/json",
    apikey: anonKey,
    Authorization: `Bearer ${authToken || anonKey}`,
    Prefer: "return=minimal",
  };

  const res = await fetch(`${supabaseUrl}/rest/v1/location_logs`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      user_id: userId,
      latitude: location.latitude,
      longitude: location.longitude,
      accuracy: location.accuracy ?? null,
      recorded_at: new Date().toISOString(),
    }),
  });

  if (!res.ok) {
    console.warn("[SW] Konum kaydedilemedi:", res.status, await res.text());
  } else {
    console.log("[SW] Konum kaydedildi:", location.latitude, location.longitude);
  }
}

// ── Açık sekmeden konum iste ───────────────────────────────────────────────

function requestLocationFromClient() {
  return new Promise(async (resolve, reject) => {
    const allClients = await self.clients.matchAll({
      includeUncontrolled: true,
      type: "window",
    });

    if (!allClients.length) {
      return reject(new Error("Açık sekme yok — konum alınamıyor."));
    }

    const channel = new MessageChannel();
    const timer = setTimeout(
      () => reject(new Error("Konum isteği zaman aşımına uğradı.")),
      15000
    );

    channel.port1.onmessage = (event) => {
      clearTimeout(timer);
      if (event.data?.error) {
        reject(new Error(event.data.error));
      } else if (event.data?.location) {
        resolve(event.data.location);
      } else {
        reject(new Error("Geçersiz konum yanıtı."));
      }
    };

    // İlk uygun sekmeye mesaj gönder
    allClients[0].postMessage({ type: "REQUEST_LOCATION" }, [channel.port2]);
  });
}

// ── Konum senkronizasyonu ──────────────────────────────────────────────────

async function syncLocation() {
  try {
    const location = await requestLocationFromClient();
    await saveLocationToSupabase(location);
  } catch (err) {
    console.log("[SW] Konum senkronizasyonu başarısız:", err.message);
  }
}

// ── Olay dinleyicileri ─────────────────────────────────────────────────────

self.addEventListener("install", (event) => {
  console.log("[SW] Yüklendi.");
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) =>
      cache.addAll(["/", "/manifest.json"])
    )
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  console.log("[SW] Aktif.");
  event.waitUntil(
    Promise.all([
      self.clients.claim(),
      // Eski önbellekleri temizle
      caches.keys().then((keys) =>
        Promise.all(
          keys
            .filter((k) => k !== CACHE_NAME)
            .map((k) => caches.delete(k))
        )
      ),
    ])
  );
});

// Periodic Background Sync — her 15-30 dakikada bir tarayıcı tarafından tetiklenir
self.addEventListener("periodicsync", (event) => {
  if (event.tag === "location-sync") {
    console.log("[SW] Periodic sync tetiklendi: location-sync");
    event.waitUntil(syncLocation());
  }
});

// Sayfa kapatılıp açıldığında Background Sync (tek seferlik yeniden deneme)
self.addEventListener("sync", (event) => {
  if (event.tag === "location-sync-once") {
    event.waitUntil(syncLocation());
  }
});

// Sayfadan gelen mesajlar
self.addEventListener("message", (event) => {
  const { type } = event.data || {};

  if (type === "SKIP_WAITING") {
    self.skipWaiting();
  }
});

// Temel fetch stratejisi: ağ önce, sonra önbellek
self.addEventListener("fetch", (event) => {
  // Sadece GET isteklerini ve aynı origin'i önbellekle
  if (
    event.request.method !== "GET" ||
    !event.request.url.startsWith(self.location.origin)
  ) {
    return;
  }

  // API ve Supabase isteklerini önbelleğe alma
  const url = new URL(event.request.url);
  if (
    url.pathname.startsWith("/api/") ||
    url.pathname.startsWith("/_next/") ||
    event.request.url.includes("supabase")
  ) {
    return;
  }

  event.respondWith(
    fetch(event.request).catch(() => caches.match(event.request))
  );
});
