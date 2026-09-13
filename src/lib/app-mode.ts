export type AppMode = "demo" | "production";
export type DemoOperation = { at: string; message: string };

export const DEMO_STORAGE_KEY = "ai-food-inventory-demo-state-v1";
export const DEMO_LOCAL_NOTICE = "デモ環境のため、この変更はこのブラウザ内のみ保持されます（共有データは変更されません）。";

const DEMO_STORAGE_EVENT = "ai-food-inventory-demo-storage";
const DEMO_HISTORY_LIMIT = 20;

/**
 * 公開事故を避けるため、production を明示した場合だけ外部 DB を利用する。
 * NEXT_PUBLIC_ 値は Client Component でもビルド時に同じ判定を共有できる。
 */
export function getAppMode(): AppMode {
  return process.env.NEXT_PUBLIC_APP_MODE?.trim().toLowerCase() === "production" ? "production" : "demo";
}

export function isDemoMode(): boolean {
  return getAppMode() === "demo";
}

export function getContactUrl(): string | null {
  const value = process.env.NEXT_PUBLIC_CONTACT_URL?.trim();
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:" ? url.toString() : null;
  } catch {
    return null;
  }
}

export function demoSuccessMessage(message: string): string {
  return isDemoMode() ? `${message} ${DEMO_LOCAL_NOTICE}` : message;
}

/** localStorage の値を検証して取り出す。改ざん・破損した値は無視する。 */
export function parseDemoOperations(raw: string | null): DemoOperation[] {
  try {
    const value: unknown = JSON.parse(raw ?? "[]");
    if (!Array.isArray(value)) return [];
    return value
      .filter(
        (entry): entry is DemoOperation =>
          typeof entry === "object" &&
          entry !== null &&
          typeof (entry as DemoOperation).at === "string" &&
          typeof (entry as DemoOperation).message === "string",
      )
      .slice(-DEMO_HISTORY_LIMIT);
  } catch {
    return [];
  }
}

/** useSyncExternalStore 用。文字列を返すため同じ内容なら同じスナップショットになる。 */
export function getDemoOperationsSnapshot(): string {
  try {
    return window.localStorage.getItem(DEMO_STORAGE_KEY) ?? "[]";
  } catch {
    return "[]";
  }
}

export function subscribeDemoOperations(callback: () => void): () => void {
  const onStorage = (event: StorageEvent) => {
    if (event.key === null || event.key === DEMO_STORAGE_KEY) callback();
  };
  window.addEventListener("storage", onStorage);
  window.addEventListener(DEMO_STORAGE_EVENT, callback);
  return () => {
    window.removeEventListener("storage", onStorage);
    window.removeEventListener(DEMO_STORAGE_EVENT, callback);
  };
}

export function recordDemoOperation(message: string): void {
  if (!isDemoMode() || typeof window === "undefined") return;
  try {
    const history = parseDemoOperations(window.localStorage.getItem(DEMO_STORAGE_KEY)).slice(-(DEMO_HISTORY_LIMIT - 1));
    window.localStorage.setItem(DEMO_STORAGE_KEY, JSON.stringify([...history, { at: new Date().toISOString(), message }]));
    window.dispatchEvent(new Event(DEMO_STORAGE_EVENT));
  } catch {
    // localStorageを利用できない環境でもデモ操作は継続する。
  }
}

/** このブラウザのデモ状態だけを消去する（他の閲覧者・サーバーには影響しない）。 */
export function clearDemoOperations(): void {
  window.localStorage.removeItem(DEMO_STORAGE_KEY);
  window.dispatchEvent(new Event(DEMO_STORAGE_EVENT));
}
