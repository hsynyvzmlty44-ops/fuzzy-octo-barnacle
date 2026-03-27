"use client";

import { createBrowserSupabaseClient } from "@/lib/supabase";
import {
  POSTIT_COLOR_IDS,
  POSTIT_COLOR_LABELS,
  POSTIT_SURFACE_CLASS,
  POSTIT_SWATCH_CLASS,
  normalizePostItColor,
  type PostItColorId,
} from "@/lib/postit-colors";
import { readLocalPostits, writeLocalPostits } from "@/lib/local-postits";
import type { PostItNote } from "@/lib/postit-types";
import { cn } from "@/lib/utils";
import { StickyNote } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

type DbRow = {
  id: string;
  content: string;
  pos_x_pct: number;
  pos_y_pct: number;
  z_index: number;
  color?: string | null;
};

function rowToNote(r: DbRow): PostItNote {
  return {
    id: r.id,
    content: r.content ?? "",
    posXPct: r.pos_x_pct,
    posYPct: r.pos_y_pct,
    zIndex: r.z_index ?? 1,
    color: normalizePostItColor(r.color),
  };
}

function noteToRow(n: PostItNote): DbRow & { updated_at: string } {
  return {
    id: n.id,
    content: n.content,
    pos_x_pct: n.posXPct,
    pos_y_pct: n.posYPct,
    z_index: n.zIndex,
    color: n.color,
    updated_at: new Date().toISOString(),
  };
}

function clamp(n: number, min: number, max: number) {
  return Math.min(max, Math.max(min, n));
}

export type DigitalPostitsProps = {
  userEmail: string | null;
  localSession?: boolean;
};

export function DigitalPostits({
  userEmail,
  localSession = false,
}: DigitalPostitsProps) {
  const useLocalOnly = Boolean(localSession && !userEmail);
  const [notes, setNotes] = useState<PostItNote[]>([]);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const supabaseRef = useRef<ReturnType<
    typeof createBrowserSupabaseClient
  > | null>(null);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const notesRef = useRef<PostItNote[]>([]);
  const drag = useRef<{
    id: string;
    startX: number;
    startY: number;
    origX: number;
    origY: number;
  } | null>(null);
  const nextZ = useRef(10);
  const [paletteOpen, setPaletteOpen] = useState(false);
  /** Not konumları bu katmana göre % — sayfa ile birlikte kayar */
  const notesLayerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    notesRef.current = notes;
  }, [notes]);

  const persistAll = useCallback(
    (list: PostItNote[]) => {
      if (useLocalOnly) {
        writeLocalPostits(list);
        return;
      }
      const client = supabaseRef.current;
      if (!client) return;
      void (async () => {
        const rows = list.map((n) => noteToRow(n));
        const { error: e } = await client
          .from("couple_postits")
          .upsert(rows, { onConflict: "id" });
        if (e) console.warn("postit upsert", e.message);
      })();
    },
    [useLocalOnly]
  );

  const schedulePersist = useCallback(
    (list: PostItNote[]) => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(() => {
        saveTimer.current = null;
        persistAll(list);
      }, 450);
    },
    [persistAll]
  );

  useEffect(() => {
    if (!userEmail && !localSession) return;

    if (useLocalOnly) {
      setNotes(readLocalPostits());
      setReady(true);
      setError(null);
      return;
    }

    let client: ReturnType<typeof createBrowserSupabaseClient> | null = null;
    try {
      client = createBrowserSupabaseClient();
      supabaseRef.current = client;
    } catch {
      setError("Post-it için Supabase gerekli.");
      setReady(true);
      return;
    }

    let cancelled = false;
    (async () => {
      const { data, error: qErr } = await client!
        .from("couple_postits")
        .select("id,content,pos_x_pct,pos_y_pct,z_index,color")
        .order("created_at", { ascending: true });
      if (cancelled) return;
      if (qErr) {
        setError(
          qErr.message.includes("relation") || qErr.code === "42P01"
            ? "couple_postits tablosu yok — supabase şemasını güncelle."
            : qErr.message
        );
        setReady(true);
        return;
      }
      const rows = (data ?? []) as DbRow[];
      const loaded = rows.map(rowToNote);
      setNotes(loaded);
      nextZ.current =
        Math.max(10, ...loaded.map((n) => n.zIndex), 0) + 1;
      setReady(true);
    })();

    const channel = client
      .channel(`postits-${userEmail}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "couple_postits",
        },
        (payload: {
          eventType?: string;
          new?: Record<string, unknown>;
          old?: Record<string, unknown>;
        }) => {
          if (payload.eventType === "DELETE") {
            const id = payload.old?.id as string | undefined;
            if (!id) return;
            setNotes((prev) => prev.filter((n) => n.id !== id));
            return;
          }
          const row = payload.new as DbRow | undefined;
          if (!row?.id) return;
          const note = rowToNote(row);
          setNotes((prev) => {
            const i = prev.findIndex((n) => n.id === note.id);
            if (i === -1) return [...prev, note];
            const copy = [...prev];
            copy[i] = note;
            return copy;
          });
        }
      )
      .subscribe();

    return () => {
      cancelled = true;
      void client?.removeChannel(channel);
    };
  }, [userEmail, localSession, useLocalOnly]);

  const addNoteWithColor = useCallback(
    (color: PostItColorId) => {
      const rnd = (min: number, max: number) =>
        min + Math.random() * (max - min);
      const id =
        typeof crypto !== "undefined" && crypto.randomUUID
          ? crypto.randomUUID()
          : `local-${Date.now()}-${Math.random().toString(36).slice(2)}`;
      const z = nextZ.current++;
      const note: PostItNote = {
        id,
        content: "",
        posXPct: clamp(rnd(2, 76), 0, 88),
        posYPct: clamp(rnd(4, 72), 0, 85),
        zIndex: z,
        color,
      };
      setNotes((prev) => {
        const next = [...prev, note];
        if (useLocalOnly) writeLocalPostits(next);
        else persistAll(next);
        return next;
      });
      setPaletteOpen(false);
    },
    [persistAll, useLocalOnly]
  );

  const updateNote = useCallback(
    (id: string, patch: Partial<PostItNote>) => {
      setNotes((prev) => {
        const next = prev.map((n) =>
          n.id === id ? { ...n, ...patch } : n
        );
        if (useLocalOnly) writeLocalPostits(next);
        else schedulePersist(next);
        return next;
      });
    },
    [schedulePersist, useLocalOnly]
  );

  const removeNote = useCallback(
    (id: string) => {
      setNotes((prev) => {
        const next = prev.filter((n) => n.id !== id);
        if (useLocalOnly) writeLocalPostits(next);
        else {
          const client = supabaseRef.current;
          void client?.from("couple_postits").delete().eq("id", id);
        }
        return next;
      });
    },
    [useLocalOnly]
  );

  const bringFront = useCallback(
    (id: string) => {
      const z = nextZ.current++;
      updateNote(id, { zIndex: z });
    },
    [updateNote]
  );

  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      const d = drag.current;
      if (!d) return;
      const layer = notesLayerRef.current;
      const w = layer?.offsetWidth ?? window.innerWidth;
      const h = layer?.offsetHeight ?? window.innerHeight;
      const dx = ((e.clientX - d.startX) / w) * 100;
      const dy = ((e.clientY - d.startY) / h) * 100;
      const posXPct = clamp(d.origX + dx, 0, 88);
      const posYPct = clamp(d.origY + dy, 0, 85);
      setNotes((prev) => {
        const next = prev.map((n) =>
          n.id === d.id ? { ...n, posXPct, posYPct } : n
        );
        notesRef.current = next;
        return next;
      });
    };
    const onUp = () => {
      if (!drag.current) return;
      drag.current = null;
      const list = notesRef.current;
      if (useLocalOnly) writeLocalPostits(list);
      else schedulePersist(list);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
    };
  }, [schedulePersist, useLocalOnly]);

  const onDragStart = (e: React.PointerEvent, note: PostItNote) => {
    if ((e.target as HTMLElement).closest("button")) return;
    e.preventDefault();
    bringFront(note.id);
    drag.current = {
      id: note.id,
      startX: e.clientX,
      startY: e.clientY,
      origX: note.posXPct,
      origY: note.posYPct,
    };
  };

  if (!userEmail && !localSession) return null;

  return (
    <>
      <div
        ref={notesLayerRef}
        className="pointer-events-none absolute inset-0 z-[35]"
      >
        {ready &&
          notes.map((note) => (
            <div
              key={note.id}
              className="pointer-events-auto absolute w-[min(220px,calc(100vw-1.5rem))] sm:w-[min(240px,calc(100vw-2rem))] md:w-[min(260px,calc(100vw-3rem))]"
              style={{
                left: `${note.posXPct}%`,
                top: `${note.posYPct}%`,
                zIndex: note.zIndex,
              }}
            >
              <div className="group relative w-full">
                <div
                  className={cn(
                    "relative overflow-hidden rounded-2xl shadow-[0_12px_28px_rgba(0,0,0,0.22)] ring-1 ring-black/5",
                    POSTIT_SURFACE_CLASS[note.color]
                  )}
                >
                  <button
                    type="button"
                    onClick={() => removeNote(note.id)}
                    onPointerDown={(e) => e.stopPropagation()}
                    className="pointer-events-auto absolute right-1 top-1 z-30 rounded-full bg-black/10 px-1.5 py-0.5 text-[11px] font-bold leading-none text-neutral-900 ring-1 ring-black/10 transition-colors hover:bg-black/15"
                    aria-label="Notu sil"
                  >
                    ✕
                  </button>
                  {/* Üst: sürükleme */}
                  <div
                    role="presentation"
                    className="h-11 w-full cursor-grab active:cursor-grabbing"
                    onPointerDown={(e) => onDragStart(e, note)}
                    aria-hidden
                  />
                  <div className="relative px-3 pb-4 pt-0">
                    <textarea
                      value={note.content}
                      onChange={(e) =>
                        updateNote(note.id, { content: e.target.value })
                      }
                      onPointerDown={(e) => e.stopPropagation()}
                      placeholder=""
                      rows={5}
                      className="min-h-[100px] w-full resize-none bg-transparent text-[13px] font-semibold leading-snug text-neutral-950 caret-neutral-950 placeholder:text-neutral-950/35 focus:outline-none focus-visible:outline-none sm:text-sm md:text-[15px]"
                    />
                  </div>
                </div>
              </div>
            </div>
          ))}
      </div>

      <div className="pointer-events-none fixed bottom-[max(1rem,env(safe-area-inset-bottom))] left-1/2 z-[200] flex max-w-[calc(100vw-1rem)] -translate-x-1/2 flex-col items-center gap-2 sm:bottom-6 sm:left-auto sm:right-6 sm:translate-x-0 sm:items-end md:right-8">
        {paletteOpen && ready && (
          <div
            className="pointer-events-auto grid grid-cols-3 gap-2 rounded-2xl border border-white/20 bg-[#0f172a]/90 p-2.5 shadow-xl backdrop-blur-md"
            role="dialog"
            aria-label="Not rengi seç"
          >
            {POSTIT_COLOR_IDS.map((cid) => (
              <button
                key={cid}
                type="button"
                onClick={() => addNoteWithColor(cid)}
                className="rounded-lg p-0.5 ring-2 ring-transparent transition hover:ring-[#C8A2C8]/80 focus:outline-none focus:ring-[#C8A2C8]"
                title={POSTIT_COLOR_LABELS[cid]}
              >
                <span
                  className={cn(
                    "block h-12 w-12 rounded-md shadow-md ring-1 ring-black/10 sm:h-14 sm:w-14",
                    POSTIT_SWATCH_CLASS[cid]
                  )}
                />
              </button>
            ))}
          </div>
        )}
        <button
          type="button"
          onClick={() => setPaletteOpen((o) => !o)}
          disabled={!ready}
          className="pointer-events-auto flex items-center gap-2 rounded-full border border-[#C8A2C8]/50 bg-[#C8A2C8]/25 px-4 py-2.5 text-sm font-medium text-[#f5f0ff] shadow-lg backdrop-blur-md transition hover:bg-[#C8A2C8]/40 disabled:opacity-50"
        >
          <StickyNote className="h-4 w-4 shrink-0" aria-hidden />
          {paletteOpen ? "Renk seç…" : "Not ekle"}
        </button>
      </div>

      {error && (
        <p className="pointer-events-none fixed bottom-[max(5rem,env(safe-area-inset-bottom))] left-1/2 z-[200] max-w-sm -translate-x-1/2 text-center text-[10px] text-amber-200/90 sm:bottom-20 sm:left-auto sm:right-8 sm:translate-x-0 sm:text-left md:right-10">
          {error}
        </p>
      )}
    </>
  );
}
