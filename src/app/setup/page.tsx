import type { Metadata } from "next";
import { Settings2 } from "lucide-react";
import { redirect } from "next/navigation";
import { connection } from "next/server";

import { Card, CardBody } from "@/components/ui/primitives";
import { getDemoSessionEnv, getSupabasePublicEnv } from "@/lib/supabase/env";

export const metadata: Metadata = { title: "初期設定が必要です" };

export default async function SetupPage({ searchParams }: PageProps<"/setup">) {
  // 環境変数の有無は実行時に判定する（ビルド時に静的化しない）
  await connection();
  const publicEnv = getSupabasePublicEnv();
  const demoEnv = getDemoSessionEnv();
  const params = await searchParams;
  const reason = typeof params.reason === "string" ? params.reason : null;
  if (publicEnv && demoEnv && !reason) redirect("/dashboard");

  return (
    <main className="flex min-h-screen items-center justify-center px-4 py-10">
      <Card className="w-full max-w-xl">
        <CardBody className="space-y-4 p-6">
          <div className="flex items-center gap-3">
            <Settings2 className="size-6 text-amber-600" aria-hidden="true" />
            <h1 className="text-lg font-semibold text-slate-900">Supabase の接続設定が必要です</h1>
          </div>
          <p className="text-sm text-slate-700">
            {reason
              ? "固定デモセッションまたはデモ組織を利用できません。環境変数と seed の実行結果を確認してください。"
              : "このアプリは Supabase のデモデータを使用します。以下の接続設定が不足しているため、画面を表示できません。"}
          </p>
          <ul className="list-disc space-y-1 pl-5 font-mono text-sm text-slate-800">
            <li>NEXT_PUBLIC_SUPABASE_URL</li>
            <li>NEXT_PUBLIC_SUPABASE_ANON_KEY</li>
            <li>DEMO_USER_EMAIL</li>
            <li>DEMO_USER_PASSWORD</li>
          </ul>
          <p className="text-sm text-slate-700">
            ローカル環境では <code className="rounded bg-slate-100 px-1">.env.example</code> をコピーして{" "}
            <code className="rounded bg-slate-100 px-1">.env.local</code> を作成し、Vercel ではプロジェクトの Environment Variables に登録してください。手順は README の「セットアップ」を参照してください。
          </p>
        </CardBody>
      </Card>
    </main>
  );
}
