import {
  ALBUM_PAGE_COUNT,
  type AlbumPageData,
} from "@/lib/album-types";
import type { SupabaseClient } from "@supabase/supabase-js";

type AlbumRow = {
  page_index: number;
  quote: string;
  date: string;
  image_data: string | null;
  image_rotation: number | null;
  image_scale: number | null;
  image_pan_x: number | null;
  image_pan_y: number | null;
};

function emptyPages(): AlbumPageData[] {
  return Array.from({ length: ALBUM_PAGE_COUNT }, () => ({
    date: "",
    quote: "",
    image: null,
  }));
}

function pageScore(p: AlbumPageData): number {
  return (
    (p.image ? 1_000_000 : 0) +
    p.quote.length +
    p.date.length +
    (p.imageScale !== undefined && p.imageScale !== 1 ? 10 : 0) +
    (p.imageRotation !== undefined && p.imageRotation !== 0 ? 10 : 0)
  );
}

/** İki kaynaktan sayfa sayfa daha “dolu” olanı seçer */
export function mergeAlbumForSync(
  local: AlbumPageData[],
  remote: AlbumPageData[]
): AlbumPageData[] {
  const out = emptyPages();
  for (let i = 0; i < ALBUM_PAGE_COUNT; i++) {
    const a = local[i]!;
    const b = remote[i]!;
    out[i] = pageScore(a) >= pageScore(b) ? { ...a } : { ...b };
  }
  return out;
}

export function albumHasAnyContent(pages: AlbumPageData[]): boolean {
  return pages.some((p) => Boolean(p.image || p.quote.trim() || p.date.trim()));
}

function rowToPage(row: AlbumRow): AlbumPageData {
  return {
    date: row.date ?? "",
    quote: row.quote ?? "",
    image: row.image_data && row.image_data.length > 0 ? row.image_data : null,
    imageRotation:
      typeof row.image_rotation === "number" && Number.isFinite(row.image_rotation)
        ? row.image_rotation
        : undefined,
    imageScale:
      typeof row.image_scale === "number" &&
      Number.isFinite(row.image_scale) &&
      row.image_scale > 0
        ? row.image_scale
        : undefined,
    imagePanX:
      typeof row.image_pan_x === "number" && Number.isFinite(row.image_pan_x)
        ? row.image_pan_x
        : undefined,
    imagePanY:
      typeof row.image_pan_y === "number" && Number.isFinite(row.image_pan_y)
        ? row.image_pan_y
        : undefined,
  };
}

export function rowsToAlbumPages(rows: AlbumRow[]): AlbumPageData[] {
  const base = emptyPages();
  for (const r of rows) {
    if (
      typeof r.page_index !== "number" ||
      r.page_index < 0 ||
      r.page_index >= ALBUM_PAGE_COUNT
    ) {
      continue;
    }
    base[r.page_index] = rowToPage(r);
  }
  return base;
}

function pageToRow(p: AlbumPageData, pageIndex: number): Record<string, unknown> {
  return {
    page_index: pageIndex,
    quote: p.quote,
    date: p.date,
    image_data: p.image,
    image_rotation: p.imageRotation ?? null,
    image_scale: p.imageScale ?? null,
    image_pan_x: p.imagePanX ?? null,
    image_pan_y: p.imagePanY ?? null,
    updated_at: new Date().toISOString(),
  };
}

export async function fetchAlbumPagesRemote(
  client: SupabaseClient
): Promise<AlbumPageData[] | null> {
  const { data, error } = await client
    .from("couple_album_pages")
    .select("*")
    .order("page_index", { ascending: true });
  if (error) {
    console.warn("Albüm buluttan okunamadı:", error.message);
    return null;
  }
  if (!data?.length) return emptyPages();
  return rowsToAlbumPages(data as AlbumRow[]);
}

export async function upsertAlbumPagesRemote(
  client: SupabaseClient,
  pages: AlbumPageData[],
  indices: Iterable<number>
): Promise<boolean> {
  const rows: Record<string, unknown>[] = [];
  for (const i of indices) {
    if (i < 0 || i >= ALBUM_PAGE_COUNT) continue;
    rows.push(pageToRow(pages[i]!, i));
  }
  if (rows.length === 0) return true;
  const { error } = await client
    .from("couple_album_pages")
    .upsert(rows, { onConflict: "page_index" });
  if (error) {
    console.warn("Albüm buluta yazılamadı:", error.message);
    return false;
  }
  return true;
}

/** Tüm sayfaları tek seferde buluta yazar (ilk yükleme / tam senkron) */
export async function upsertAllAlbumPagesRemote(
  client: SupabaseClient,
  pages: AlbumPageData[]
): Promise<boolean> {
  const rows = pages.map((p, i) => pageToRow(p, i));
  const { error } = await client
    .from("couple_album_pages")
    .upsert(rows, { onConflict: "page_index" });
  if (error) {
    console.warn("Albüm tam senkron başarısız:", error.message);
    return false;
  }
  return true;
}
