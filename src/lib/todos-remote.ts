import type { CoupleTodoItem } from "@/lib/todo-types";
import type { SupabaseClient } from "@supabase/supabase-js";

type TodoRow = {
  id: string;
  text: string;
  done: boolean;
  sort_order: number;
};

export async function fetchTodosRemote(
  client: SupabaseClient
): Promise<CoupleTodoItem[] | null> {
  const { data, error } = await client
    .from("couple_todos")
    .select("id,text,done,sort_order")
    .order("sort_order", { ascending: true });
  if (error) {
    console.warn("Yapılacaklar buluttan okunamadı:", error.message);
    return null;
  }
  return (data as TodoRow[] | null)?.map((r) => ({
    id: r.id,
    text: r.text,
    done: r.done,
  })) ?? [];
}

export async function replaceTodosRemote(
  client: SupabaseClient,
  items: CoupleTodoItem[]
): Promise<boolean> {
  const { data: existing, error: selErr } = await client
    .from("couple_todos")
    .select("id");
  if (selErr) {
    console.warn("Yapılacaklar listelenemedi:", selErr.message);
    return false;
  }
  const keep = new Set(items.map((t) => t.id));
  for (const row of existing ?? []) {
    const id = (row as { id: string }).id;
    if (!keep.has(id)) {
      const { error } = await client.from("couple_todos").delete().eq("id", id);
      if (error) console.warn("Todo silinemedi:", error.message);
    }
  }
  const now = new Date().toISOString();
  const upsertRows = items.map((t, i) => ({
    id: t.id,
    text: t.text,
    done: t.done,
    sort_order: i,
    updated_at: now,
  }));
  if (upsertRows.length === 0) return true;
  const { error } = await client
    .from("couple_todos")
    .upsert(upsertRows, { onConflict: "id" });
  if (error) {
    console.warn("Yapılacaklar buluta yazılamadı:", error.message);
    return false;
  }
  return true;
}
