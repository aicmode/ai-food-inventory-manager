"use server";

import { authorizeAction } from "@/lib/auth/context";
import { logDbError, toUserMessage } from "@/lib/errors";
import { isUuid } from "@/lib/search-params";
import type { ActionResult } from "@/lib/validation/common";

export async function setLotQuarantineAction(lotId: string, quarantined: boolean): Promise<ActionResult> {
  const auth = await authorizeAction("inventory.quarantine");
  if (!auth.ok) return auth;
  if (!isUuid(lotId)) return { ok: false, message: "ロットの指定が正しくありません。" };
  const { error } = await auth.context.supabase.rpc("set_lot_quarantine", {
    p_lot_id: lotId,
    p_quarantined: quarantined,
    p_reason: quarantined ? "品質確認のため隔離（ロット一覧から操作）" : undefined,
  });
  if (error) {
    logDbError("set_lot_quarantine", error);
    return { ok: false, message: toUserMessage(error, "ロットの状態を変更できませんでした。") };
  }
  return { ok: true, message: quarantined ? "ロットを隔離しました。出庫対象から除外されます。" : "隔離を解除しました。" };
}
