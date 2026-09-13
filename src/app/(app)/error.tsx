"use client";

import { AlertTriangle, RotateCw } from "lucide-react";
import Link from "next/link";
import { useEffect } from "react";

import { buttonClasses } from "@/components/ui/button";

export default function AppError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  useEffect(() => {
    console.error("[app-error]", error.digest ?? error.message);
  }, [error]);

  return (
    <div role="alert" className="mx-auto max-w-lg rounded-lg border border-red-200 bg-white p-6 text-center shadow-sm">
      <AlertTriangle className="mx-auto size-10 text-red-600" aria-hidden="true" />
      <h1 className="mt-3 text-lg font-semibold text-slate-900">データを表示できませんでした</h1>
      <p className="mt-2 text-sm text-slate-600">
        通信の問題か、一時的なサーバーエラーの可能性があります。「再試行」を押しても解決しない場合は、時間をおいてお試しください。
      </p>
      {error.digest ? <p className="mt-2 text-xs text-slate-400">エラーID: {error.digest}</p> : null}
      <div className="mt-5 flex justify-center gap-2">
        <button type="button" onClick={() => retry()} className={buttonClasses("primary")}>
          <RotateCw className="size-4" aria-hidden="true" />
          再試行
        </button>
        <Link href="/dashboard" className={buttonClasses("secondary")}>
          ダッシュボードへ
        </Link>
      </div>
    </div>
  );
}
