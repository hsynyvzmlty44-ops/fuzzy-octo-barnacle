import {
  ALBUM_PAGE_COUNT,
  type AlbumPageData,
} from "@/lib/album-types";

/** Eski sürüm localStorage anahtarı (migration) */
const LEGACY_LS_KEY = "lila-couple-album";
/** IndexedDB anahtarı */
const IDB_KEY = "lila-couple-album-pages";
const DB_NAME = "lila-kopru";
const DB_VER = 1;
const STORE = "kv";

function emptyPages(): AlbumPageData[] {
  return Array.from({ length: ALBUM_PAGE_COUNT }, () => ({
    date: "",
    quote: "",
    image: null,
  }));
}

function pageRichness(p: AlbumPageData): number {
  return (
    (p.image ? 1_000_000 : 0) +
    p.quote.length +
    p.date.length +
    (p.imageScale !== undefined && p.imageScale !== 1 ? 10 : 0) +
    (p.imageRotation !== undefined && p.imageRotation !== 0 ? 10 : 0)
  );
}

/** İki kaynaktan sayfa sayfa zengin olanı al (foto / metin kaybını önler) */
function mergeAlbumPages(a: AlbumPageData[], b: AlbumPageData[]): AlbumPageData[] {
  const out = emptyPages();
  for (let i = 0; i < ALBUM_PAGE_COUNT; i++) {
    const pa = a[i]!;
    const pb = b[i]!;
    out[i] = pageRichness(pa) >= pageRichness(pb) ? { ...pa } : { ...pb };
  }
  return out;
}

function parsePagesJson(raw: string): AlbumPageData[] {
  try {
    const v = JSON.parse(raw) as unknown;
    if (!Array.isArray(v)) return emptyPages();
    const base = emptyPages();
    for (let i = 0; i < ALBUM_PAGE_COUNT; i++) {
      const p = v[i];
      if (!p || typeof p !== "object") continue;
      const o = p as Record<string, unknown>;
      const rot = o.imageRotation;
      const sc = o.imageScale;
      const px = o.imagePanX;
      const py = o.imagePanY;
      base[i] = {
        date: typeof o.date === "string" ? o.date : "",
        quote: typeof o.quote === "string" ? o.quote : "",
        image: typeof o.image === "string" ? o.image : null,
        imageRotation:
          typeof rot === "number" && Number.isFinite(rot) ? rot : undefined,
        imageScale:
          typeof sc === "number" && Number.isFinite(sc) && sc > 0
            ? sc
            : undefined,
        imagePanX:
          typeof px === "number" && Number.isFinite(px) ? px : undefined,
        imagePanY:
          typeof py === "number" && Number.isFinite(py) ? py : undefined,
      };
    }
    return base;
  } catch {
    return emptyPages();
  }
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VER);
    req.onerror = () => reject(req.error ?? new Error("indexedDB"));
    req.onsuccess = () => resolve(req.result);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE);
      }
    };
  });
}

function idbGet(db: IDBDatabase, key: string): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readonly");
    const r = tx.objectStore(STORE).get(key);
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}

function idbPut(db: IDBDatabase, key: string, value: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.objectStore(STORE).put(value, key);
  });
}

/**
 * Albümü diskten yükle (IndexedDB; yoksa eski localStorage’dan taşır).
 * Base64 fotoğraflar localStorage kotasını aşmasın diye IDB kullanılır.
 */
export async function loadAlbumPages(): Promise<AlbumPageData[]> {
  if (typeof window === "undefined") return emptyPages();

  let fromIdb: AlbumPageData[] | null = null;
  try {
    const db = await openDb();
    const raw = await idbGet(db, IDB_KEY);
    if (typeof raw === "string" && raw.length > 0) {
      fromIdb = parsePagesJson(raw);
    }
  } catch {
    /* IDB kapalı */
  }

  let fromLs: AlbumPageData[] | null = null;
  try {
    const ls = window.localStorage.getItem(LEGACY_LS_KEY);
    if (ls) fromLs = parsePagesJson(ls);
  } catch {
    /* ignore */
  }

  let result: AlbumPageData[];
  if (fromIdb && fromLs) result = mergeAlbumPages(fromIdb, fromLs);
  else result = fromIdb ?? fromLs ?? emptyPages();

  const hadAny = fromIdb !== null || fromLs !== null;
  if (hadAny) {
    void saveAlbumPages(result).then(() => {
      try {
        window.localStorage.removeItem(LEGACY_LS_KEY);
      } catch {
        /* ignore */
      }
    });
  }
  return result;
}

/** Sekme kapanırken senkron yedek (IDB gecikmesine karşı) */
export function syncAlbumPagesToLegacyLocalStorage(pages: AlbumPageData[]): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(LEGACY_LS_KEY, JSON.stringify(pages));
  } catch {
    /* kotayı aşmış olabilir — sessiz */
  }
}

/** Albümü kalıcı depoya yaz (IndexedDB; olmazsa localStorage yedek). */
export async function saveAlbumPages(pages: AlbumPageData[]): Promise<void> {
  if (typeof window === "undefined") return;
  const json = JSON.stringify(pages);
  try {
    const db = await openDb();
    await idbPut(db, IDB_KEY, json);
    try {
      window.localStorage.removeItem(LEGACY_LS_KEY);
    } catch {
      /* ignore */
    }
    return;
  } catch (e) {
    console.warn("Albüm IndexedDB kaydı başarısız, localStorage deneniyor", e);
  }
  try {
    window.localStorage.setItem(LEGACY_LS_KEY, json);
  } catch (e2) {
    console.warn(
      "Albüm kaydedilemedi (depolama dolu veya tarayıcı engelliyor)",
      e2
    );
  }
}
