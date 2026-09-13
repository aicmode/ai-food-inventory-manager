"use server";

import { authorizeAction } from "@/lib/auth/context";
import { logDbError, toUserMessage } from "@/lib/errors";
import { todayJst } from "@/lib/format";
import { isUuid } from "@/lib/search-params";
import { formDataToObject, parseJsonField, validationFailure, type ActionResult } from "@/lib/validation/common";
import { purchaseOrderDraftUpdateSchema, purchaseOrderSchema } from "@/lib/validation/schemas";

export async function createPurchaseOrderAction(_previous: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const auth = await authorizeAction("purchase.manage");
  if (!auth.ok) return auth;
  const fields = formDataToObject(formData);
  const parsed = purchaseOrderSchema(todayJst()).safeParse({
    ...fields,
    submit: fields.intent === "order",
    items: parseJsonField(formData.get("items")),
  });
  if (!parsed.success) return validationFailure(parsed.error);

  const { data, error } = await auth.context.supabase.rpc("create_purchase_order", {
    p_organization_id: auth.context.organization.id,
    p_supplier_id: parsed.data.supplier_id,
    p_location_id: parsed.data.location_id,
    p_items: parsed.data.items,
    p_submit: parsed.data.submit,
    p_expected_delivery_date: parsed.data.expected_delivery_date,
    p_notes: parsed.data.notes,
  });
  if (error || !data) {
    logDbError("create_purchase_order", error);
    return { ok: false, message: toUserMessage(error, "発注書を作成できませんでした。") };
  }
  return {
    ok: true,
    message: parsed.data.submit ? "発注を確定しました。" : "発注書を下書き保存しました。",
    redirectTo: `/purchase-orders/${data}`,
  };
}

export async function updatePurchaseOrderDraftAction(orderId: string, _previous: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const auth = await authorizeAction("purchase.manage");
  if (!auth.ok) return auth;
  if (!isUuid(orderId)) return { ok: false, message: "発注書の指定が正しくありません。" };
  const fields = formDataToObject(formData);
  const parsed = purchaseOrderDraftUpdateSchema.safeParse({ ...fields, items: parseJsonField(formData.get("items")) });
  if (!parsed.success) return validationFailure(parsed.error);

  const { error } = await auth.context.supabase.rpc("update_purchase_order_draft", {
    p_purchase_order_id: orderId,
    p_items: parsed.data.items,
    p_expected_delivery_date: parsed.data.expected_delivery_date,
    p_notes: parsed.data.notes,
  });
  if (error) {
    logDbError("update_purchase_order_draft", error);
    return { ok: false, message: toUserMessage(error, "発注書を保存できませんでした。") };
  }
  return { ok: true, message: "下書きを保存しました。" };
}

export async function setPurchaseOrderStatusAction(orderId: string, status: "ordered" | "cancelled"): Promise<ActionResult> {
  const auth = await authorizeAction("purchase.manage");
  if (!auth.ok) return auth;
  if (!isUuid(orderId) || (status !== "ordered" && status !== "cancelled")) return { ok: false, message: "入力値が正しくありません。" };
  const { error } = await auth.context.supabase.rpc("set_purchase_order_status", { p_purchase_order_id: orderId, p_status: status });
  if (error) {
    logDbError("set_purchase_order_status", error);
    return { ok: false, message: toUserMessage(error, "発注書の状態を変更できませんでした。") };
  }
  return { ok: true, message: status === "ordered" ? "発注を確定しました。入荷時に「入庫登録」を行ってください。" : "発注書をキャンセルしました。" };
}
