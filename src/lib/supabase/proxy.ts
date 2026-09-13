import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

import { isDemoMode } from "@/lib/app-mode";
import type { Database } from "./database.types";
import { getSupabasePublicEnv } from "./env";

function redirectWithCookies(request: NextRequest, source: NextResponse, pathname: string, search?: URLSearchParams) {
  const url = request.nextUrl.clone();
  url.pathname = pathname;
  url.search = search ? `?${search.toString()}` : "";
  const redirect = NextResponse.redirect(url);
  for (const cookie of source.cookies.getAll()) {
    redirect.cookies.set(cookie);
  }
  redirect.headers.set("Cache-Control", "private, no-store");
  return redirect;
}

/**
 * Demo Modeは外部通信をせず通過する。Client Production Modeのみ
 * 既存のSupabaseセッションを更新し、RLS用JWTを維持する。
 */
export async function updateSession(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (isDemoMode()) return NextResponse.next();

  const env = getSupabasePublicEnv();

  if (!env) {
    if (pathname === "/" || pathname === "/setup") return NextResponse.next();
    const url = request.nextUrl.clone();
    url.pathname = "/setup";
    url.search = "";
    return NextResponse.redirect(url);
  }

  let response = NextResponse.next({ request });

  const supabase = createServerClient<Database>(env.url, env.anonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet, headers) {
        for (const { name, value } of cookiesToSet) {
          request.cookies.set(name, value);
        }
        response = NextResponse.next({ request });
        for (const { name, value, options } of cookiesToSet) {
          response.cookies.set(name, value, options);
        }
        for (const [key, value] of Object.entries(headers)) {
          response.headers.set(key, value);
        }
      },
    },
  });

  const claims = await supabase.auth.getClaims();
  if (!claims.data?.claims?.sub) {
    if (pathname === "/" || pathname === "/setup") return response;
    const search = new URLSearchParams({ reason: "production-session" });
    return redirectWithCookies(request, response, "/setup", search);
  }

  if (pathname === "/setup") {
    if (request.nextUrl.searchParams.has("reason")) return response;
    return redirectWithCookies(request, response, "/dashboard");
  }

  response.headers.set("Cache-Control", "private, no-store");
  return response;
}
