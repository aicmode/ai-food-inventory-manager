"use client";

import { ConfirmButton } from "@/components/ui/confirm-button";

import { setLotQuarantineAction } from "./actions";

export function LotQuarantineButton({ lotId, lotNumber, quarantined }: { lotId: string; lotNumber: string; quarantined: boolean }) {
  return quarantined ? (
    <ConfirmButton
      action={() => setLotQuarantineAction(lotId, false)}
      title="隔離を解除しますか？"
      description={`ロット「${lotNumber}」を出庫可能な状態に戻します。品質確認が完了していることを確認してください。`}
      confirmLabel="解除する"
      size="sm"
      variant="ghost"
    >
      隔離解除
    </ConfirmButton>
  ) : (
    <ConfirmButton
      action={() => setLotQuarantineAction(lotId, true)}
      title="ロットを隔離しますか？"
      description={`ロット「${lotNumber}」を出庫対象から除外します（在庫数量は変わりません）。廃棄が必要な場合は廃棄登録を行ってください。`}
      confirmLabel="隔離する"
      confirmVariant="danger"
      size="sm"
      variant="ghost"
    >
      隔離
    </ConfirmButton>
  );
}
