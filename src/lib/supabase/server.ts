import "server-only";

import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

import type { Database } from "./database.types";
import { requireSupabasePublicEnv } from "./env";

/**
 * Server Components / Server Actions / Route Handlers 用。
 * ユーザーのセッション（JWT）で接続するため、すべてのクエリに RLS が適用される。
 */
export async function createClient() {
  const env = requireSupabasePublicEnv();
  const cookieStore = await cookies();

  return createServerClient<Database>(env.url, env.anonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, options);
          }
        } catch {
          // Server Component のレンダリング中は cookie を書き込めない（Next.js の仕様）。
          // セッションの更新は src/proxy.ts が毎リクエストで行うため、ここでは書き込みを省略する。
        }
      },
    },
  });
}

export type ServerSupabaseClient = Awaited<ReturnType<typeof createClient>>;
