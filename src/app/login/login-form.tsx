"use client";

import { usernameToEmail } from "@/lib/auth-helpers";
import { COUPLE_LOGIN_PASSWORD } from "@/lib/login-password";
import { resolveAllowedLoginUsername } from "@/lib/login-users";
import {
  clearLocalSessionCookieClient,
  setLocalSessionCookieClient,
} from "@/lib/local-auth";
import { cn } from "@/lib/utils";
import { createBrowserSupabaseClient } from "@/lib/supabase";
import { motion } from "framer-motion";
import { Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

const easeOutBezier = [0.22, 1, 0.36, 1] as const;

const inputClass = cn(
  "w-full border-0 border-b border-white/25 bg-transparent pb-2.5 text-base text-white placeholder:text-white/50",
  "outline-none transition-[border-color,box-shadow]",
  "focus:border-[#C8A2C8] focus:shadow-[0_4px_24px_-8px_rgba(200,162,200,0.55)]"
);

export function LoginForm() {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const u = username.trim();
    if (!u || !password) {
      setError("Kullanıcı adı ve şifre gerekli.");
      return;
    }

    const allowedUser = resolveAllowedLoginUsername(u);
    if (!allowedUser) {
      setError("Bu kelime bizi anlatmıyor");
      return;
    }
    if (password !== COUPLE_LOGIN_PASSWORD) {
      setError("Boynundaki kalbe bir daha bak");
      return;
    }

    setLoading(true);
    const email = usernameToEmail(allowedUser);

    try {
      let supabase;
      try {
        supabase = createBrowserSupabaseClient();
      } catch {
        setLocalSessionCookieClient();
        setLoading(false);
        router.refresh();
        router.replace("/dashboard");
        return;
      }

      const { error: signError } = await supabase.auth.signInWithPassword({
        email,
        password: COUPLE_LOGIN_PASSWORD,
      });

      if (signError) {
        setLoading(false);
        setError(
          [
            "Bulut hesabına girilemedi; anılar/yapılacaklar diğer cihazda görünmez.",
            `Hata: ${signError.message}`,
            `Olması gereken e-posta: ${email}`,
            "Çözüm: PC’de .env.local + SUPABASE_SERVICE_ROLE_KEY ile `npm run supabase:create-user` — veya Supabase → Authentication’da bu e-postayla kullanıcı aç; şifre `login-password.ts` içindeki çift şifresiyle aynı olsun.",
          ].join("\n")
        );
        return;
      }

      clearLocalSessionCookieClient();
      await supabase.auth.getSession();
      setLoading(false);
      router.refresh();
      router.replace("/dashboard");
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Bir bağlantı hatası oluştu."
      );
      setLoading(false);
    }
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{
        opacity: 1,
        y: 0,
        transition: { duration: 0.45, ease: [...easeOutBezier] },
      }}
      className={cn(
        "relative z-10 w-full max-w-[min(100%,28rem)] rounded-[2rem] border border-white/10 bg-white/5 p-6 shadow-2xl backdrop-blur-2xl sm:max-w-md sm:rounded-[2.25rem] sm:p-8 md:max-w-lg md:rounded-[2.5rem] md:p-10 lg:max-w-xl lg:p-12"
      )}
    >
      <form onSubmit={(e) => void onSubmit(e)} className="space-y-6">
        <div>
          <label
            htmlFor="username"
            className="mb-2 block text-xs font-medium uppercase tracking-wider text-white/45"
          >
            Kullanıcı adı
          </label>
          <input
            id="username"
            name="username"
            type="text"
            autoComplete="username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            disabled={loading}
            className={inputClass}
            placeholder="aramızdaki o kelime"
          />
        </div>
        <div>
          <label
            htmlFor="password"
            className="mb-2 block text-xs font-medium uppercase tracking-wider text-white/45"
          >
            Şifre
          </label>
          <input
            id="password"
            name="password"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            disabled={loading}
            className={inputClass}
            placeholder="kalbindeki tarih"
          />
        </div>

        {error && (
          <p
            className="whitespace-pre-line text-center text-sm leading-relaxed text-rose-200/95"
            role="alert"
          >
            {error}
          </p>
        )}

        <motion.button
          type="submit"
          disabled={loading}
          whileHover={{ scale: loading ? 1 : 1.02 }}
          whileTap={{ scale: loading ? 1 : 0.98 }}
          className={cn(
            "flex w-full items-center justify-center gap-2 rounded-2xl px-6 py-3.5 text-sm font-semibold text-[#0F172A] sm:py-4 sm:text-base",
            "bg-gradient-to-r from-[#C8A2C8] via-[#d4b8e8] to-[#e9d5ff]",
            "shadow-lg transition-shadow hover:shadow-[0_0_20px_rgba(200,162,200,0.45)]",
            "disabled:opacity-70"
          )}
        >
          {loading ? (
            <>
              <Loader2
                className="h-5 w-5 shrink-0 animate-spin text-[#0F172A]/80"
                aria-hidden
              />
              <span>Kalpler birleşiyor...</span>
            </>
          ) : (
            "Giriş yap"
          )}
        </motion.button>
      </form>
    </motion.div>
  );
}
