import type { PostItColorId } from "@/lib/postit-colors";

export type PostItNote = {
  id: string;
  content: string;
  /** Görünüm alanına göre 0–100 */
  posXPct: number;
  posYPct: number;
  zIndex: number;
  color: PostItColorId;
};
