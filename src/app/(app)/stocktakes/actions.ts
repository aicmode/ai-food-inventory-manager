"use server";

import { authorizeAction } from "@/lib/auth/context";
import { logDbError, toUserMessage } from "@/lib/errors";
import { isUuid } from "@/lib/search-params";
import { formDataToObject, parseJsonField, validationFailure, type ActionResult } from "@/lib/validation/common";
import { stocktakeCountsSchema, stocktakeCreateSchema } from "@/lib/validation/schemas";

export async function createStocktakeAction(_previous: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const auth = await authorizeAction("stocktake.manage");
  if (!auth.ok) return auth;
  const parsed = stocktakeCreateSchema.safeParse(formDataToObject(formData));
  if (!parsed.success) return validationFailure(parsed.error);
  const { data, error } = await auth.context.supabase.rpc("create_stocktake", {
    p_organization_id: auth.context.organization.id,
    p_location_id: parsed.data.location_id,
    p_category_id: parsed.data.category_id,
    p_notes: parsed.data.notes,
  });
  if (error || !data) {
    logDbError("create_stocktake", error);
    return { ok: false, message: toUserMessage(error, "棚卸を開始できませんでした。") };
  }
  return { ok: true, message: "棚卸を開始しました。現在庫を理論在庫として記録しています。", redirectTo: `/stocktakes/${data}` };
}

export async function saveStocktakeCountsAction(stocktakeId: string, _previous: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const auth = await authorizeAction("stocktake.count");
  if (!auth.ok) return auth;
  if (!isUuid(stocktakeId)) return { ok: false, message: "棚卸の指定が正しくありません。" };
  const parsed = stocktakeCountsSchema.safeParse({ items: parseJsonField(formData.get("items")) });
  if (!parsed.success) return validationFailure(parsed.error);
  const { data, error } = await auth.context.supabase.rpc("save_stocktake_counts", {
    p_stocktake_id: stocktakeId,
    p_items: parsed.data.items.map((item) => ({
      item_id: item.item_id,
      actual_quantity: item.actual_quantity ?? null,
      reason: item.reason ?? null,
    })),
  });
  if (error) {
    logDbError("save_stocktake_counts", error);
    return { ok: false, message: toUserMessage(error, "カウントを保存できませんでした。") };
  }
  return { ok: true, message: `${data ?? parsed.data.items.length} 品目のカウントを保存しました。` };
}

export async function completeStocktakeAction(stocktakeId: string): Promise<ActionResult> {
  const auth = await authorizeAction("stocktake.manage");
  if (!auth.ok) return auth;
  if (!isUuid(stocktakeId)) return { ok: false, message: "棚卸の指定が正しくありません。" };
  const { data, error } = await auth.context.supabase.rpc("complete_stocktake", { p_stocktake_id: stocktakeId });
  if (error) {
    logDbError("complete_stocktake", error);
    return { ok: false, message: toUserMessage(error, "棚卸を確定できませんでした。") };
  }
  return { ok: true, message: `棚卸を確定しました。${data ?? 0} 品目の差異を在庫に反映しました。` };
}

export async function cancelStocktakeAction(stocktakeId: string): Promise<ActionResult> {
  const auth = await authorizeAction("stocktake.manage");
  if (!auth.ok) return auth;
  if (!isUuid(stocktakeId)) return { ok: false, message: "棚卸の指定が正しくありません。" };
  const { error } = await auth.context.supabase.rpc("cancel_stocktake", { p_stocktake_id: stocktakeId });
  if (error) {
    logDbError("cancel_stocktake", error);
    return { ok: false, message: toUserMessage(error, "棚卸を中止できませんでした。") };
  }
  return { ok: true, message: "棚卸を中止しました。在庫は変更されていません。" };
}
