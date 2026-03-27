import {
  ALBUM_PAGE_COUNT,
  type AlbumPageData,
} from "@/lib/album-types";

const KEY = "lila-couple-album";

function emptyPages(): AlbumPageData[] {
  return Array.from({ length: ALBUM_PAGE_COUNT }, () => ({
    date: "",
    quote: "",
    image: null,
  }));
}

export function readAlbumPages(): AlbumPageData[] {
  if (typeof window === "undefined") return emptyPages();
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return emptyPages();
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

export function writeAlbumPages(pages: AlbumPageData[]) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(KEY, JSON.stringify(pages));
  } catch (e) {
    console.warn("Albüm kaydedilemedi (depolama dolu olabilir)", e);
  }
}
