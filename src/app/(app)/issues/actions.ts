"use server";

import { authorizeAction } from "@/lib/auth/context";
import { logDbError, toUserMessage } from "@/lib/errors";
import { formDataToObject, parseJsonField, validationFailure, type ActionResult } from "@/lib/validation/common";
import { issueSchema } from "@/lib/validation/schemas";

export async function createIssueAction(_previous: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const auth = await authorizeAction("inventory.issue");
  if (!auth.ok) return auth;
  const fields = formDataToObject(formData);
  const parsed = issueSchema.safeParse({ ...fields, items: parseJsonField(formData.get("items")) });
  if (!parsed.success) return validationFailure(parsed.error);

  const { data, error } = await auth.context.supabase.rpc("issue_stock", {
    p_organization_id: auth.context.organization.id,
    p_location_id: parsed.data.location_id,
    p_issue_type: parsed.data.issue_type,
    p_items: parsed.data.items,
    p_destination_location_id: parsed.data.destination_location_id,
    p_notes: parsed.data.notes,
  });
  if (error || !data) {
    logDbError("issue_stock", error);
    return { ok: false, message: toUserMessage(error, "出庫を登録できませんでした。") };
  }
  return {
    ok: true,
    message:
      parsed.data.issue_type === "transfer"
        ? "拠点間移動を登録しました。移動元・移動先の在庫とロットに反映されています。"
        : "出庫を登録しました。賞味期限の早いロットから引き当てています。",
    redirectTo: `/inventory/transactions?reference=${data}`,
  };
}
