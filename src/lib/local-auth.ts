/** Tarayıcıda ayarlanır; middleware + dashboard ile uyumlu yerel oturum (Supabase yokken). */
export const LOCAL_SESSION_COOKIE = "lila_local_session";
export const LOCAL_SESSION_VALUE = "1";

export function setLocalSessionCookieClient(): void {
  const maxAge = 60 * 60 * 24 * 7;
  const secure =
    typeof window !== "undefined" && window.location.protocol === "https:";
  document.cookie = `${LOCAL_SESSION_COOKIE}=${LOCAL_SESSION_VALUE}; path=/; max-age=${maxAge}; SameSite=Lax${secure ? "; Secure" : ""}`;
}
