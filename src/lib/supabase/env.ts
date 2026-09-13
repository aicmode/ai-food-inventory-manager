/**
 * Supabase の公開設定（ブラウザに渡してよい値のみ）。
 * service role key はアプリ本体では使わない（seed スクリプト専用）。
 */
export type SupabasePublicEnv = { url: string; anonKey: string };
export type DemoSessionEnv = { email: string; password: string };

export function getSupabasePublicEnv(): SupabasePublicEnv | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();
  if (!url || !anonKey) return null;
  return { url, anonKey };
}

export function requireSupabasePublicEnv(): SupabasePublicEnv {
  const env = getSupabasePublicEnv();
  if (!env) {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL と NEXT_PUBLIC_SUPABASE_ANON_KEY を設定してください。");
  }
  return env;
}

/**
 * ポートフォリオ閲覧者用の固定デモセッション。
 * 値はサーバー側だけで使用し、ブラウザへは渡さない。
 */
export function getDemoSessionEnv(): DemoSessionEnv | null {
  const email = process.env.DEMO_USER_EMAIL?.trim();
  const password = process.env.DEMO_USER_PASSWORD?.trim();
  if (!email || !password) return null;
  return { email, password };
}
