import { createServerSupabaseClient } from "@/lib/supabase/server";

/** profiles: isim, boy, sehir — RLS ile oturumlu kullanıcıya göre filtrelenir. */
export async function fetchProfiles() {
  const supabase = await createServerSupabaseClient();
  return supabase.from("profiles").select("isim, boy, sehir");
}

/** moods: durum, tarih */
export async function fetchMoods() {
  const supabase = await createServerSupabaseClient();
  return supabase.from("moods").select("durum, tarih");
}

/** counters: tanışma tarihi (tek satır / çift için) */
export async function fetchCounters() {
  const supabase = await createServerSupabaseClient();
  return supabase.from("counters").select("tanisma_tarihi");
}
