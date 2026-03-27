/**
 * Supabase Auth e-posta alanında Türkçe ı, ğ vb. kabul etmez (Dashboard da uyarı verir).
 * Girişte "bakalım" yazılsa bile Auth’a ASCII güvenli adres gider.
 */
function foldEmailLabelToAscii(label: string): string {
  const map: Record<string, string> = {
    İ: "i",
    I: "i",
    ı: "i",
    Ğ: "g",
    ğ: "g",
    Ü: "u",
    ü: "u",
    Ş: "s",
    ş: "s",
    Ö: "o",
    ö: "o",
    Ç: "c",
    ç: "c",
  };
  const out = [...label.trim()]
    .map((c) => map[c] ?? c)
    .join("")
    .toLowerCase();
  return out.replace(/[^a-z0-9._-]/g, ""); // izin verilmeyen kalanları at
}

/** Supabase Auth e-posta — kullanıcı adı + domain .env’den; tamamı ASCII. */
export function usernameToEmail(username: string): string {
  const rawDomain =
    process.env.NEXT_PUBLIC_AUTH_EMAIL_DOMAIN?.trim() || "lila.local";
  const local = foldEmailLabelToAscii(username);
  const domain = rawDomain
    .split(".")
    .map((part) => foldEmailLabelToAscii(part))
    .filter(Boolean)
    .join(".");
  return `${local}@${domain}`;
}
