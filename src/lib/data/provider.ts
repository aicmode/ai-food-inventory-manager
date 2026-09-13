import "server-only";

import { connection } from "next/server";

import { getAppMode, type AppMode } from "@/lib/app-mode";
import { createClient as createSupabaseClient, type ServerSupabaseClient } from "@/lib/supabase/server";

export type DataProvider = {
  mode: AppMode;
  client: ServerSupabaseClient;
};

/** UIはこの境界からdemo fixtureまたはSupabase実装を受け取る。 */
export async function createDataProvider(): Promise<DataProvider> {
  if (getAppMode() === "demo") {
    // デモデータは「今日」を基準に期限・履歴を組み立てるため、ビルド時の静的HTMLに固定しない。
    await connection();
    // production bundleの通常経路でdemo generatorを評価しないよう遅延ロードする。
    const { createDemoClient } = await import("./demo/client");
    return { mode: "demo", client: createDemoClient() };
  }
  return { mode: "production", client: await createSupabaseClient() };
}
