"use server";

import { authorizeAction } from "@/lib/auth/context";
import { logDbError, toUserMessage } from "@/lib/errors";
import { todayJst } from "@/lib/format";
import { formDataToObject, validationFailure, type ActionResult } from "@/lib/validation/common";
import { wasteSchema } from "@/lib/validation/schemas";

export async function createWasteAction(_previous: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const auth = await authorizeAction("inventory.waste");
  if (!auth.ok) return auth;
  const parsed = wasteSchema(todayJst()).safeParse(formDataToObject(formData));
  if (!parsed.success) return validationFailure(parsed.error);

  const { data, error } = await auth.context.supabase.rpc("record_waste", {
    p_organization_id: auth.context.organization.id,
    p_location_id: parsed.data.location_id,
    p_product_id: parsed.data.product_id,
    p_quantity: parsed.data.quantity,
    p_reason: parsed.data.reason,
    p_waste_date: parsed.data.waste_date,
    p_lot_id: parsed.data.lot_id,
    p_notes: parsed.data.notes,
  });
  if (error) {
    logDbError("record_waste", error);
    return { ok: false, message: toUserMessage(error, "廃棄を登録できませんでした。") };
  }
  return { ok: true, message: `廃棄を登録しました（${data ?? 1} ロット）。在庫から減算しています。`, redirectTo: "/waste" };
}
