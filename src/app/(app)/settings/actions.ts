"use server";

import { authorizeAction } from "@/lib/auth/context";
import { logDbError, toUserMessage } from "@/lib/errors";
import { formDataToObject, validationFailure, type ActionResult } from "@/lib/validation/common";
import { categorySchema, organizationSettingsSchema } from "@/lib/validation/schemas";

export async function updateOrganizationAction(_previous: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const auth = await authorizeAction("organization.manage");
  if (!auth.ok) return auth;
  if (auth.context.isDemo) return { ok: false, message: "ポートフォリオ版では組織設定を変更できません。" };
  const parsed = organizationSettingsSchema.safeParse(formDataToObject(formData));
  if (!parsed.success) return validationFailure(parsed.error);

  const { data, error } = await auth.context.supabase
    .from("organizations")
    .update(parsed.data)
    .eq("id", auth.context.organization.id)
    .select("id");
  if (error) {
    logDbError("update organization", error);
    return { ok: false, message: toUserMessage(error) };
  }
  if (data.length === 0) return { ok: false, message: "この操作を行う権限がありません。" };
  return { ok: true, message: "組織設定を保存しました。" };
}

export async function createCategoryAction(_previous: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const auth = await authorizeAction("master.manage");
  if (!auth.ok) return auth;
  const parsed = categorySchema.safeParse(formDataToObject(formData));
  if (!parsed.success) return validationFailure(parsed.error);
  const { error } = await auth.context.supabase.from("categories").insert({
    organization_id: auth.context.organization.id,
    name: parsed.data.name,
    code: parsed.data.code.toUpperCase(),
    parent_id: parsed.data.parent_id ?? null,
    sort_order: parsed.data.sort_order,
  });
  if (error) {
    logDbError("create category", error);
    return { ok: false, message: toUserMessage(error, "カテゴリを追加できませんでした。") };
  }
  return { ok: true, message: "カテゴリを追加しました。" };
}
