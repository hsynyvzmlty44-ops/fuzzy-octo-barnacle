import { normalizePostItColor } from "@/lib/postit-colors";
import type { PostItNote } from "@/lib/postit-types";

const KEY = "lila-couple-postits";

function safeParse(raw: string | null): PostItNote[] {
  if (!raw) return [];
  try {
    const v = JSON.parse(raw) as unknown;
    if (!Array.isArray(v)) return [];
    return v.map(mapLegacyNote).filter((n): n is PostItNote => n !== null);
  } catch {
    return [];
  }
}

function mapLegacyNote(x: unknown): PostItNote | null {
  if (!x || typeof x !== "object") return null;
  const o = x as Record<string, unknown>;
  if (
    typeof o.id !== "string" ||
    typeof o.content !== "string" ||
    typeof o.posXPct !== "number" ||
    typeof o.posYPct !== "number" ||
    typeof o.zIndex !== "number"
  ) {
    return null;
  }
  return {
    id: o.id,
    content: o.content,
    posXPct: o.posXPct,
    posYPct: o.posYPct,
    zIndex: o.zIndex,
    color: normalizePostItColor(o.color),
  };
}

export function readLocalPostits(): PostItNote[] {
  if (typeof window === "undefined") return [];
  return safeParse(window.localStorage.getItem(KEY));
}

export function writeLocalPostits(notes: PostItNote[]) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(KEY, JSON.stringify(notes));
}
