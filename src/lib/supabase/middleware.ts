import { LOCAL_SESSION_COOKIE, LOCAL_SESSION_VALUE } from "@/lib/local-auth";
import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  const localSession =
    request.cookies.get(LOCAL_SESSION_COOKIE)?.value === LOCAL_SESSION_VALUE;

  if (!url || !key) {
    const path = request.nextUrl.pathname;
    if (path.startsWith("/dashboard") && !localSession) {
      const u = request.nextUrl.clone();
      u.pathname = "/login";
      return NextResponse.redirect(u);
    }
    if (path.startsWith("/login") && localSession) {
      const u = request.nextUrl.clone();
      u.pathname = "/dashboard";
      return NextResponse.redirect(u);
    }
    return response;
  }

  const supabase = createServerClient(url, key, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) =>
          response.cookies.set(name, value, options)
        );
      },
    },
  });

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const path = request.nextUrl.pathname;

  if (path.startsWith("/dashboard") && !user && !localSession) {
    const u = request.nextUrl.clone();
    u.pathname = "/login";
    return NextResponse.redirect(u);
  }

  if (path.startsWith("/login") && (user || localSession)) {
    const u = request.nextUrl.clone();
    u.pathname = "/dashboard";
    return NextResponse.redirect(u);
  }

  return response;
}
