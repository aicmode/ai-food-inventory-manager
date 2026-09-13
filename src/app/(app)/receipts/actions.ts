"use server";

import { authorizeAction } from "@/lib/auth/context";
import { logDbError, toUserMessage } from "@/lib/errors";
import { todayJst } from "@/lib/format";
import { formDataToObject, parseJsonField, validationFailure, type ActionResult } from "@/lib/validation/common";
import { receiptSchema } from "@/lib/validation/schemas";

export async function createReceiptAction(_previous: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const auth = await authorizeAction("inventory.receive");
  if (!auth.ok) return auth;
  const fields = formDataToObject(formData);
  const parsed = receiptSchema(todayJst()).safeParse({ ...fields, items: parseJsonField(formData.get("items")) });
  if (!parsed.success) return validationFailure(parsed.error);

  const { data, error } = await auth.context.supabase.rpc("receive_stock", {
    p_organization_id: auth.context.organization.id,
    p_location_id: parsed.data.location_id,
    p_received_date: parsed.data.received_date,
    p_items: parsed.data.items,
    p_supplier_id: parsed.data.supplier_id,
    p_purchase_order_id: parsed.data.purchase_order_id,
    p_notes: parsed.data.notes,
  });
  if (error || !data) {
    logDbError("receive_stock", error);
    return { ok: false, message: toUserMessage(error, "入庫を登録できませんでした。") };
  }
  const redirectTo = parsed.data.purchase_order_id ? `/purchase-orders/${parsed.data.purchase_order_id}` : `/inventory/transactions?reference=${data}`;
  return { ok: true, message: `${parsed.data.items.length} 明細を入庫しました。在庫とロットに反映されています。`, redirectTo };
}
