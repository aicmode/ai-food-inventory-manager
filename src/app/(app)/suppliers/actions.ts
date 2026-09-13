"use server";

import { authorizeAction } from "@/lib/auth/context";
import { logDbError, toUserMessage } from "@/lib/errors";
import { isUuid } from "@/lib/search-params";
import { formDataToObject, validationFailure, type ActionResult } from "@/lib/validation/common";
import { supplierSchema, type SupplierInput } from "@/lib/validation/schemas";

function toRow(input: SupplierInput) {
  return {
    code: input.code.toUpperCase(),
    company_name: input.company_name,
    contact_name: input.contact_name ?? null,
    email: input.email ?? null,
    phone: input.phone ?? null,
    postal_code: input.postal_code ?? null,
    prefecture: input.prefecture ?? null,
    city: input.city ?? null,
    address: input.address ?? null,
    payment_terms: input.payment_terms ?? null,
    minimum_order_amount: input.minimum_order_amount,
    standard_lead_time_days: input.standard_lead_time_days,
    notes: input.notes ?? null,
    is_active: input.is_active,
  };
}

export async function createSupplierAction(_previous: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const auth = await authorizeAction("master.manage");
  if (!auth.ok) return auth;
  const parsed = supplierSchema.safeParse(formDataToObject(formData));
  if (!parsed.success) return validationFailure(parsed.error);
  const { data, error } = await auth.context.supabase
    .from("suppliers")
    .insert({ ...toRow(parsed.data), organization_id: auth.context.organization.id })
    .select("id")
    .single();
  if (error) {
    logDbError("create supplier", error);
    return { ok: false, message: toUserMessage(error, "仕入先を登録できませんでした。") };
  }
  return { ok: true, message: `「${parsed.data.company_name}」を登録しました。`, redirectTo: `/suppliers/${data.id}` };
}

export async function updateSupplierAction(supplierId: string, _previous: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const auth = await authorizeAction("master.manage");
  if (!auth.ok) return auth;
  if (!isUuid(supplierId)) return { ok: false, message: "仕入先の指定が正しくありません。" };
  const parsed = supplierSchema.safeParse(formDataToObject(formData));
  if (!parsed.success) return validationFailure(parsed.error);
  const { data, error } = await auth.context.supabase
    .from("suppliers")
    .update(toRow(parsed.data))
    .eq("id", supplierId)
    .eq("organization_id", auth.context.organization.id)
    .select("id");
  if (error) {
    logDbError("update supplier", error);
    return { ok: false, message: toUserMessage(error, "仕入先を更新できませんでした。") };
  }
  if (data.length === 0) return { ok: false, message: "仕入先が見つからないか、更新する権限がありません。" };
  return { ok: true, message: "仕入先を更新しました。", redirectTo: `/suppliers/${supplierId}` };
}
