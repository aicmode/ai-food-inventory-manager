import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

import type { Database } from "./database.types";
import { getDemoSessionEnv, getSupabasePublicEnv } from "./env";

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
 * RLS を維持するための固定デモセッションをサーバー側で自動確立する。
 * 閲覧者にログイン・登録などの認証操作は要求しない。
 */
export async function updateSession(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const env = getSupabasePublicEnv();
  const demo = getDemoSessionEnv();

  if (!env || !demo) {
    if (pathname === "/setup") return NextResponse.next();
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
    const { error } = await supabase.auth.signInWithPassword(demo);
    if (error) {
      console.error("[proxy] failed to establish demo session", { code: error.code, status: error.status });
      if (pathname === "/setup") return response;
      const search = new URLSearchParams({ reason: "demo-session" });
      return redirectWithCookies(request, response, "/setup", search);
    }
  }

  if (pathname === "/setup") {
    if (request.nextUrl.searchParams.has("reason")) return response;
    return redirectWithCookies(request, response, "/dashboard");
  }

  response.headers.set("Cache-Control", "private, no-store");
  return response;
}
