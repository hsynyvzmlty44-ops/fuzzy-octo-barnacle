/**
 * Tek ortak giriş — kullanıcı adı .env ile değiştirilebilir (varsayılan: bakalım).
 */
export function allowedLoginUsername(): string {
  return (
    process.env.NEXT_PUBLIC_LOGIN_USERNAME?.trim() ||
    process.env.NEXT_PUBLIC_LOGIN_USERNAME_A?.trim() ||
    "bakalım"
  );
}

/** Türkçe i/ı karışıklığında eşleştirme (klavye: bakalim ≈ bakalım) */
function foldUsernameForCompare(s: string): string {
  return s
    .trim()
    .toLocaleLowerCase("tr-TR")
    .replace(/ı/g, "i");
}

/** Girilen ad izinliyse .env’deki kanon kullanıcı adını döndür, değilse null */
export function resolveAllowedLoginUsername(input: string): string | null {
  const u = input.trim();
  if (!u) return null;
  const allowed = allowedLoginUsername();
  if (foldUsernameForCompare(u) === foldUsernameForCompare(allowed)) {
    return allowed;
  }
  return null;
}
