/**
 * Supabase Auth’ta tek kullanıcı oluşturur veya şifresini günceller.
 * Gerekli: .env.local içinde URL, anon değil service_role, domain, kullanıcı adı.
 *
 *   npm run supabase:create-user
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { usernameToEmail } from "../src/lib/auth-helpers";
import { COUPLE_LOGIN_PASSWORD } from "../src/lib/login-password";

function loadEnvLocal() {
  const p = join(process.cwd(), ".env.local");
  if (!existsSync(p)) {
    console.error("Bulunamadı: .env.local — Önce oluşturup Supabase değişkenlerini doldur.");
    process.exit(1);
  }
  const raw = readFileSync(p, "utf8");
  for (let line of raw.split("\n")) {
    line = line.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq === -1) continue;
    const k = line.slice(0, eq).trim();
    let v = line.slice(eq + 1).trim();
    if (
      (v.startsWith('"') && v.endsWith('"')) ||
      (v.startsWith("'") && v.endsWith("'"))
    ) {
      v = v.slice(1, -1);
    }
    if (process.env[k] === undefined) process.env[k] = v;
  }
}

async function main() {
  loadEnvLocal();

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  const username =
    process.env.NEXT_PUBLIC_LOGIN_USERNAME?.trim() ||
    process.env.NEXT_PUBLIC_LOGIN_USERNAME_A?.trim() ||
    "bakalım";

  if (!url || !serviceKey) {
    console.error(
      "Eksik: NEXT_PUBLIC_SUPABASE_URL veya SUPABASE_SERVICE_ROLE_KEY (.env.local)\n" +
        "Service role: Supabase → Project Settings → API → service_role (anon değil)"
    );
    process.exit(1);
  }

  const email = usernameToEmail(username);
  const password = COUPLE_LOGIN_PASSWORD;

  const admin = createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data: listData, error: listErr } =
    await admin.auth.admin.listUsers({ perPage: 1000, page: 1 });
  if (listErr) {
    console.error("Kullanıcı listelenemedi:", listErr.message);
    process.exit(1);
  }

  const existing = listData.users.find(
    (u) => u.email?.toLowerCase() === email
  );

  if (existing) {
    const { error } = await admin.auth.admin.updateUserById(existing.id, {
      password,
      email_confirm: true,
    });
    if (error) {
      console.error("Şifre güncellenemedi:", error.message);
      process.exit(1);
    }
    console.log("Tamam — kullanıcı zaten vardı, şifre güncellendi.");
    console.log("  E-posta:", email);
    return;
  }

  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (error) {
    console.error("Kullanıcı oluşturulamadı:", error.message);
    process.exit(1);
  }
  console.log("Tamam — Auth kullanıcısı oluşturuldu.");
  console.log("  E-posta:", data.user?.email ?? email);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
