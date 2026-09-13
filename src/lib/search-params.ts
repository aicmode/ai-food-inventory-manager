/** URL クエリの安全な読み取り（不正値は無視し、DB に渡さない） */

export type SearchParams = Record<string, string | string[] | undefined>;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DATE = /^\d{4}-\d{2}-\d{2}$/;

export function textParam(params: SearchParams, key: string, max = 100): string | undefined {
  const raw = params[key];
  const value = (Array.isArray(raw) ? raw[0] : raw)?.trim();
  if (!value) return undefined;
  return value.slice(0, max);
}

export function uuidParam(params: SearchParams, key: string): string | undefined {
  const value = textParam(params, key, 36);
  return value && UUID.test(value) ? value : undefined;
}

export function enumParam<T extends string>(params: SearchParams, key: string, allowed: readonly T[]): T | undefined {
  const value = textParam(params, key, 40);
  return value && (allowed as readonly string[]).includes(value) ? (value as T) : undefined;
}

export function dateParam(params: SearchParams, key: string): string | undefined {
  const value = textParam(params, key, 10);
  if (!value || !DATE.test(value)) return undefined;
  const parsed = new Date(`${value}T00:00:00Z`);
  return Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value ? undefined : value;
}

export function isUuid(value: string): boolean {
  return UUID.test(value);
}

/** LIKE / PostgREST フィルタに渡す検索語から特殊文字を除去 */
export function sanitizeFilterText(value: string): string {
  return value.replace(/[%_,()\\*"'.:]/g, " ").trim();
}

/** オープンリダイレクト防止: アプリ内パスのみ許可 */
export function safeRedirectPath(value: unknown, fallback = "/dashboard"): string {
  if (typeof value !== "string") return fallback;
  if (!value.startsWith("/") || value.startsWith("//") || value.startsWith("/\\")) return fallback;
  return value.slice(0, 500);
}
