"use server";

import { authorizeAction } from "@/lib/auth/context";
import { logDbError, toUserMessage } from "@/lib/errors";
import { isUuid } from "@/lib/search-params";
import { formDataToObject, validationFailure, type ActionResult } from "@/lib/validation/common";
import { locationSchema, type LocationInput } from "@/lib/validation/schemas";

function toRow(input: LocationInput) {
  return {
    code: input.code.toUpperCase(),
    name: input.name,
    type: input.type,
    postal_code: input.postal_code ?? null,
    prefecture: input.prefecture ?? null,
    city: input.city ?? null,
    address: input.address ?? null,
    phone: input.phone ?? null,
    is_active: input.is_active,
  };
}

export async function createLocationAction(_previous: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const auth = await authorizeAction("locations.manage");
  if (!auth.ok) return auth;
  const parsed = locationSchema.safeParse(formDataToObject(formData));
  if (!parsed.success) return validationFailure(parsed.error);
  const { error } = await auth.context.supabase.from("locations").insert({ ...toRow(parsed.data), organization_id: auth.context.organization.id });
  if (error) {
    logDbError("create location", error);
    return { ok: false, message: toUserMessage(error, "拠点を登録できませんでした。") };
  }
  return { ok: true, message: `「${parsed.data.name}」を登録しました。`, redirectTo: "/locations" };
}

export async function updateLocationAction(locationId: string, _previous: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const auth = await authorizeAction("locations.manage");
  if (!auth.ok) return auth;
  if (!isUuid(locationId)) return { ok: false, message: "拠点の指定が正しくありません。" };
  const parsed = locationSchema.safeParse(formDataToObject(formData));
  if (!parsed.success) return validationFailure(parsed.error);
  const { data, error } = await auth.context.supabase
    .from("locations")
    .update(toRow(parsed.data))
    .eq("id", locationId)
    .eq("organization_id", auth.context.organization.id)
    .select("id");
  if (error) {
    logDbError("update location", error);
    return { ok: false, message: toUserMessage(error, "拠点を更新できませんでした。") };
  }
  if (data.length === 0) return { ok: false, message: "拠点が見つからないか、更新する権限がありません。" };
  return { ok: true, message: "拠点を更新しました。", redirectTo: "/locations" };
}
