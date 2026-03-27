/** Pastel not renkleri — Tailwind sınıfları dosyada sabit (purge için) */
export const POSTIT_COLOR_IDS = [
  "pink",
  "lilac",
  "red",
  "blue",
  "green",
  "yellow",
] as const;

export type PostItColorId = (typeof POSTIT_COLOR_IDS)[number];

export const POSTIT_COLOR_LABELS: Record<PostItColorId, string> = {
  pink: "Açık pembe",
  lilac: "Lila",
  red: "Açık kırmızı",
  blue: "Açık mavi",
  green: "Açık yeşil",
  yellow: "Açık sarı",
};

/** Not kartı arka planı */
export const POSTIT_SURFACE_CLASS: Record<PostItColorId, string> = {
  pink: "bg-[#f6a8c9]",
  lilac: "bg-[#e5d0ed]",
  red: "bg-[#ff8a8a]",
  blue: "bg-[#b8d8f5]",
  green: "bg-[#c5f0c8]",
  yellow: "bg-[#fff3b8]",
};

/** Palet önizlemesi (küçük kare) */
export const POSTIT_SWATCH_CLASS: Record<PostItColorId, string> = {
  pink: "bg-[#f6a8c9]",
  lilac: "bg-[#e5d0ed]",
  red: "bg-[#ff8a8a]",
  blue: "bg-[#b8d8f5]",
  green: "bg-[#c5f0c8]",
  yellow: "bg-[#fff3b8]",
};

export function normalizePostItColor(raw: unknown): PostItColorId {
  if (
    typeof raw === "string" &&
    (POSTIT_COLOR_IDS as readonly string[]).includes(raw)
  ) {
    return raw as PostItColorId;
  }
  return "pink";
}
