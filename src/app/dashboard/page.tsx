import { logout } from "@/app/dashboard/actions";
import { LOCAL_SESSION_COOKIE, LOCAL_SESSION_VALUE } from "@/lib/local-auth";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { AlbumCorner } from "@/components/album-corner";
import { BizCounter } from "@/components/biz-counter";
import { CoupleTodoList } from "@/components/couple-todo-list";
import { DigitalPostits } from "@/components/digital-postits";
import { FloatingHearts } from "@/components/floating-hearts";
import { cn } from "@/lib/utils";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import Link from "next/link";

export default async function DashboardPage() {
  const cookieStore = await cookies();
  const localOk =
    cookieStore.get(LOCAL_SESSION_COOKIE)?.value === LOCAL_SESSION_VALUE;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  let user = null;
  if (url && key) {
    const supabase = await createServerSupabaseClient();
    const {
      data: { user: u },
    } = await supabase.auth.getUser();
    user = u;
  }

  if (!user && !localOk) redirect("/login");

  return (
    <>
      <FloatingHearts />
      {localOk && !user ? (
        <div
          className="pointer-events-none fixed left-0 right-0 top-0 z-[60] flex justify-center px-4 pt-3"
          role="status"
        >
          <p className="max-w-md rounded-2xl border border-amber-400/35 bg-amber-950/80 px-4 py-2 text-center text-xs leading-snug text-amber-100/95 shadow-lg backdrop-blur-md">
            Yerel oturumdasın: Supabase oturumu yok, albüm ve yapılacaklar bu cihaza
            yazılıyor. Çıkış yap → yeniden giriş yap; giriş sayfasında kırmızı hata
            çıkarsa `npm run supabase:create-user` veya Auth’ta{" "}
            <code className="rounded bg-black/30 px-1">NEXT_PUBLIC_AUTH_EMAIL_DOMAIN</code>{" "}
            ile aynı e-postayı kullan. Vercel’de{" "}
            <code className="rounded bg-black/30 px-1">NEXT_PUBLIC_SUPABASE_*</code>{" "}
            tanımlı olsun.
          </p>
        </div>
      ) : null}
      <AlbumCorner useCloudSync={Boolean(user)} />
      <div className="relative w-full self-stretch">
        <DigitalPostits
          userEmail={user?.email ?? null}
          localSession={localOk}
        />
        <div className="relative z-10 mx-auto flex w-full max-w-2xl flex-col items-stretch gap-6 sm:gap-8 md:max-w-3xl md:gap-10 lg:max-w-4xl lg:gap-12">
          <div
            className={cn(
              "rounded-[2rem] border border-white/10 bg-white/5 p-6 text-center shadow-2xl backdrop-blur-2xl sm:rounded-[2.25rem] sm:p-8 md:rounded-[2.5rem] md:p-10 lg:p-12"
            )}
          >
            <BizCounter />

            <form action={logout} className="mt-10">
              <button
                type="submit"
                className="text-sm text-[#C8A2C8] underline-offset-2 hover:underline"
              >
                Çıkış
              </button>
            </form>

            <p className="mt-6">
              <Link
                href="/"
                className="text-xs text-white/35 transition hover:text-white/55"
              >
                Ana sayfa
              </Link>
            </p>
          </div>

          <CoupleTodoList useCloudSync={Boolean(user)} />
        </div>
      </div>
    </>
  );
}
