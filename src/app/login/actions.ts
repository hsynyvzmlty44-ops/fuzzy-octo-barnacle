"use server";

import { createClient } from "@supabase/supabase-js";

export type LoginFailureKind = "username" | "password" | "unknown";

/**
 * Giriş başarısız olduğunda kullanıcı adı mı şifre mi ayırt etmek için.
 * `SUPABASE_SERVICE_ROLE_KEY` tanımlıysa Auth admin ile e-posta var mı kontrol edilir.
 * Tanımlı değilse `unknown` döner (genel mesaj gösterilir).
 */
export async function resolveLoginFailureReason(
  email: string
): Promise<LoginFailureKind> {
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  if (!serviceKey || !url) return "unknown";

  try {
    const admin = createClient(url, serviceKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });
    const { data, error } = await admin.auth.admin.listUsers({
      perPage: 1000,
      page: 1,
    });
    if (error || !data?.users?.length) return "unknown";

    const normalized = email.trim().toLowerCase();
    const exists = data.users.some(
      (u) => u.email?.toLowerCase() === normalized
    );
    return exists ? "password" : "username";
  } catch {
    return "unknown";
  }
}
