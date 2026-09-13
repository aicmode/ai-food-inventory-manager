"use client";

import { RotateCcw } from "lucide-react";
import { useMemo, useSyncExternalStore } from "react";

import { buttonClasses } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import {
  clearDemoOperations,
  getDemoOperationsSnapshot,
  parseDemoOperations,
  subscribeDemoOperations,
} from "@/lib/app-mode";
import { formatDateTime } from "@/lib/format";

const getServerSnapshot = () => "[]";

/** このブラウザ内だけに保持したデモ操作の履歴と、初期状態へのリセット */
export function DemoResetPanel() {
  const toast = useToast();
  const raw = useSyncExternalStore(subscribeDemoOperations, getDemoOperationsSnapshot, getServerSnapshot);
  const operations = useMemo(() => parseDemoOperations(raw).reverse(), [raw]);

  function reset() {
    if (!window.confirm("このブラウザに保存されたデモ操作を削除し、デモデータを初期状態へ戻しますか？\n（他の閲覧者の画面には影響しません）")) return;
    try {
      clearDemoOperations();
      toast.success("デモデータを初期状態へ戻しました。");
    } catch {
      toast.error("ブラウザ内のデモデータをリセットできませんでした。ブラウザ設定を確認してください。");
    }
  }

  return (
    <div className="space-y-3">
      <div>
        <p className="text-xs font-semibold text-slate-700">このブラウザでのデモ操作（{operations.length} 件）</p>
        {operations.length === 0 ? (
          <p className="mt-1 text-xs text-slate-500">まだ操作はありません。入庫・出庫・発注などを試すとここに記録されます。</p>
        ) : (
          <ul className="mt-2 max-h-48 space-y-1.5 overflow-y-auto text-xs text-slate-600">
            {operations.map((operation, index) => (
              <li key={`${operation.at}-${index}`} className="rounded border border-slate-100 bg-slate-50 px-2 py-1.5">
                <span className="mr-2 text-slate-400 tabular-nums">{formatDateTime(operation.at)}</span>
                {operation.message}
              </li>
            ))}
          </ul>
        )}
      </div>
      <button type="button" onClick={reset} className={buttonClasses("secondary", "md")}>
        <RotateCcw className="size-4" aria-hidden="true" />
        デモデータを初期状態へ戻す
      </button>
    </div>
  );
}
