import { createClient } from "@supabase/supabase-js";
import { createBrowserClient } from "@supabase/ssr";

/**
 * `@supabase/supabase-js` — genel API / sunucu tarafı anon istemci.
 */
export function createSupabaseJsClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) {
    throw new Error(
      "NEXT_PUBLIC_SUPABASE_URL ve NEXT_PUBLIC_SUPABASE_ANON_KEY .env.local içinde tanımlı olmalı."
    );
  }
  return createClient(url, key);
}

/**
 * Tarayıcıda çerez tabanlı oturum (middleware / dashboard koruması ile uyumlu).
 */
export function createBrowserSupabaseClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) {
    throw new Error(
      "NEXT_PUBLIC_SUPABASE_URL ve NEXT_PUBLIC_SUPABASE_ANON_KEY .env.local içinde tanımlı olmalı."
    );
  }
  return createBrowserClient(url, key);
}
