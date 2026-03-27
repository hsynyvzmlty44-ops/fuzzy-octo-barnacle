import type { CoupleTodoItem } from "@/lib/todo-types";

const KEY = "lila-couple-todos";

function newId(): string {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return `t-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function readLocalTodos(): CoupleTodoItem[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return [];
    const v = JSON.parse(raw) as unknown;
    if (!Array.isArray(v)) return [];
    return v
      .map((x): CoupleTodoItem | null => {
        if (!x || typeof x !== "object") return null;
        const o = x as Record<string, unknown>;
        if (
          typeof o.id !== "string" ||
          typeof o.text !== "string" ||
          typeof o.done !== "boolean"
        ) {
          return null;
        }
        return { id: o.id, text: o.text, done: o.done };
      })
      .filter((t): t is CoupleTodoItem => t !== null);
  } catch {
    return [];
  }
}

export function writeLocalTodos(items: CoupleTodoItem[]) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(KEY, JSON.stringify(items));
}

export { newId as newTodoId };
