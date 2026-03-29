"use client";

import { newTodoId, readLocalTodos, writeLocalTodos } from "@/lib/local-todos";
import { useEffectiveCloudSync } from "@/lib/use-effective-cloud-sync";
import { createBrowserSupabaseClient } from "@/lib/supabase";
import { fetchTodosRemote, replaceTodosRemote } from "@/lib/todos-remote";
import type { CoupleTodoItem } from "@/lib/todo-types";
import { ListTodo, Trash2 } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

export function CoupleTodoList({
  useCloudSync = false,
}: {
  useCloudSync?: boolean;
} = {}) {
  const { effectiveCloudSync, clientChecked } =
    useEffectiveCloudSync(useCloudSync);
  const [items, setItems] = useState<CoupleTodoItem[]>([]);
  const [draft, setDraft] = useState("");
  const [ready, setReady] = useState(false);
  const itemsRef = useRef(items);
  itemsRef.current = items;
  const cloudTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const pushTodosRemote = useCallback(() => {
    if (!effectiveCloudSync) return;
    if (cloudTimerRef.current) clearTimeout(cloudTimerRef.current);
    cloudTimerRef.current = setTimeout(() => {
      cloudTimerRef.current = null;
      void (async () => {
        try {
          const client = createBrowserSupabaseClient();
          await replaceTodosRemote(client, itemsRef.current);
        } catch {
          /* ignore */
        }
      })();
    }, 1200);
  }, [effectiveCloudSync]);

  useEffect(() => {
    if (!useCloudSync && !clientChecked) return;

    const local = readLocalTodos();
    setItems(local);

    if (!effectiveCloudSync) {
      setReady(true);
      return;
    }

    let cancelled = false;
    void (async () => {
      try {
        const client = createBrowserSupabaseClient();
        const remote = await fetchTodosRemote(client);
        if (cancelled) return;
        if (remote === null) {
          setReady(true);
          return;
        }
        if (remote.length > 0) {
          setItems(remote);
          writeLocalTodos(remote);
        } else if (local.length > 0) {
          await replaceTodosRemote(client, local);
        }
      } catch {
        /* yerel liste kalır */
      }
      if (!cancelled) setReady(true);
    })();

    return () => {
      cancelled = true;
    };
  }, [effectiveCloudSync, clientChecked, useCloudSync]);

  useEffect(() => {
    const flush = () => {
      writeLocalTodos(itemsRef.current);
      if (effectiveCloudSync) {
        if (cloudTimerRef.current) {
          clearTimeout(cloudTimerRef.current);
          cloudTimerRef.current = null;
        }
        void (async () => {
          try {
            const client = createBrowserSupabaseClient();
            await replaceTodosRemote(client, itemsRef.current);
          } catch {
            /* ignore */
          }
        })();
      }
    };
    const onVis = () => {
      if (document.visibilityState === "hidden") flush();
    };
    window.addEventListener("pagehide", flush);
    document.addEventListener("visibilitychange", onVis);
    return () => {
      window.removeEventListener("pagehide", flush);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [effectiveCloudSync]);

  const add = useCallback(() => {
    const text = draft.trim();
    if (!text) return;
    setDraft("");
    setItems((prev) => {
      const next = [
        ...prev,
        { id: newTodoId(), text, done: false },
      ];
      writeLocalTodos(next);
      return next;
    });
    pushTodosRemote();
  }, [draft, pushTodosRemote]);

  const toggle = useCallback((id: string) => {
    setItems((prev) => {
      const next = prev.map((t) =>
        t.id === id ? { ...t, done: !t.done } : t
      );
      writeLocalTodos(next);
      return next;
    });
    pushTodosRemote();
  }, [pushTodosRemote]);

  const remove = useCallback((id: string) => {
    setItems((prev) => {
      const next = prev.filter((t) => t.id !== id);
      writeLocalTodos(next);
      return next;
    });
    pushTodosRemote();
  }, [pushTodosRemote]);

  return (
    <section
      className="w-full rounded-[1.75rem] border border-white/10 bg-white/5 p-5 text-left shadow-xl backdrop-blur-2xl sm:rounded-[2rem] sm:p-6 md:p-8 lg:p-10"
      aria-label="Yapılacaklar listesi"
    >
      <div className="mb-5 flex items-center gap-2.5 md:mb-6">
        <ListTodo
          className="h-5 w-5 shrink-0 text-[#C8A2C8] md:h-6 md:w-6"
          aria-hidden
        />
        <h2 className="text-lg font-semibold tracking-tight text-white/95 md:text-xl">
          Yapılacaklar
        </h2>
      </div>

      <div className="flex gap-2">
        <input
          type="text"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              add();
            }
          }}
          placeholder="Yeni madde yaz…"
          disabled={!ready}
          className="min-w-0 flex-1 rounded-xl border border-white/15 bg-white/8 px-3.5 py-2.5 text-base text-white placeholder:text-white/35 focus:border-[#C8A2C8]/50 focus:outline-none focus:ring-2 focus:ring-[#C8A2C8]/25 disabled:opacity-50 md:text-[15px]"
        />
        <button
          type="button"
          onClick={add}
          disabled={!ready || !draft.trim()}
          className="shrink-0 rounded-xl border border-[#C8A2C8]/45 bg-[#C8A2C8]/20 px-4 py-2.5 text-sm font-medium text-[#f5f0ff] transition hover:bg-[#C8A2C8]/35 disabled:cursor-not-allowed disabled:opacity-40"
        >
          Ekle
        </button>
      </div>

      <ul className="mt-5 space-y-2">
        {items.length === 0 && ready && (
          <li className="rounded-xl border border-dashed border-white/12 px-4 py-8 text-center text-sm text-white/40">
            Henüz madde yok — yukarıdan ekleyin.
          </li>
        )}
        {items.map((t) => (
          <li
            key={t.id}
            className="group flex items-start gap-3 rounded-xl border border-white/8 bg-white/[0.04] px-3 py-2.5 transition hover:border-white/12"
          >
            <label className="flex min-w-0 flex-1 cursor-pointer items-start gap-3">
              <input
                type="checkbox"
                checked={t.done}
                onChange={() => toggle(t.id)}
                className="mt-0.5 h-4 w-4 shrink-0 rounded border-white/25 bg-white/10 text-[#C8A2C8] focus:ring-[#C8A2C8]/40"
              />
              <span
                className={
                  t.done
                    ? "text-sm leading-relaxed text-white/45 line-through md:text-base"
                    : "text-sm leading-relaxed text-white/90 md:text-base"
                }
              >
                {t.text}
              </span>
            </label>
            <button
              type="button"
              onClick={() => remove(t.id)}
              className="shrink-0 rounded-lg p-1.5 text-white/45 transition hover:bg-white/10 hover:text-rose-300/90 sm:text-white/30 sm:opacity-0 sm:group-hover:opacity-100 sm:hover:text-rose-300/90"
              aria-label="Maddeyi sil"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
