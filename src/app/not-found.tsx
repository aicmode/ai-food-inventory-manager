import { FileQuestion } from "lucide-react";

import { ButtonLink } from "@/components/ui/button";

export default function NotFound() {
  return (
    <main className="flex min-h-screen items-center justify-center px-4">
      <div className="max-w-md text-center">
        <FileQuestion className="mx-auto size-12 text-slate-400" aria-hidden="true" />
        <h1 className="mt-4 text-xl font-semibold text-slate-900">ページが見つかりません</h1>
        <p className="mt-2 text-sm text-slate-600">
          URL が間違っているか、データが削除された可能性があります。別の組織のデータは表示できません。
        </p>
        <div className="mt-6 flex justify-center gap-3">
          <ButtonLink href="/dashboard">ダッシュボードへ戻る</ButtonLink>
        </div>
      </div>
    </main>
  );
}
