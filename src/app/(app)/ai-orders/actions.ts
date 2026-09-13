"use server";

import { authorizeAction } from "@/lib/auth/context";
import { explainRecommendation, type Explanation } from "@/lib/ai/provider";
import { loadRecommendations } from "@/lib/data/recommendations";
import { buildTemplateExplanation } from "@/lib/domain/reason-text";
import { hasPermission } from "@/lib/domain/permissions";
import { logDbError, toUserMessage } from "@/lib/errors";
import { isUuid } from "@/lib/search-params";
import { validationFailure, type ActionResult } from "@/lib/validation/common";
import { recommendationOrderSchema } from "@/lib/validation/schemas";

export type CreatedOrder = { id: string; order_number: string; supplier_name: string; item_count: number; total_amount: number };

/** 選択した推奨商品から、仕入先ごとに発注書（下書き）を作成 */
export async function createOrdersFromRecommendationsAction(input: unknown): Promise<ActionResult<CreatedOrder[]>> {
  const auth = await authorizeAction("purchase.manage");
  if (!auth.ok) return auth;
  const parsed = recommendationOrderSchema.safeParse(input);
  if (!parsed.success) return validationFailure(parsed.error);

  const { data, error } = await auth.context.supabase.rpc("create_purchase_orders_from_recommendations", {
    p_organization_id: auth.context.organization.id,
    p_location_id: parsed.data.location_id,
    p_items: parsed.data.items,
  });
  if (error) {
    logDbError("create_purchase_orders_from_recommendations", error);
    return { ok: false, message: toUserMessage(error, "発注書を作成できませんでした。") };
  }

  const orders: CreatedOrder[] = Array.isArray(data)
    ? data.flatMap((entry) => {
        if (typeof entry !== "object" || entry === null || Array.isArray(entry)) return [];
        return [
          {
            id: String(entry.id ?? ""),
            order_number: String(entry.order_number ?? ""),
            supplier_name: String(entry.supplier_name ?? ""),
            item_count: Number(entry.item_count ?? 0),
            total_amount: Number(entry.total_amount ?? 0),
          },
        ];
      })
    : [];

  return {
    ok: true,
    message: `仕入先ごとに ${orders.length} 件の発注書（下書き）を作成しました。内容を確認して発注を確定してください。`,
    data: orders,
    redirectTo: orders.length === 1 ? `/purchase-orders/${orders[0].id}` : "/purchase-orders?status=draft",
  };
}

/** 推奨理由の説明文（AI API があれば生成、なければテンプレート） */
export async function explainRecommendationAction(locationId: string, productId: string): Promise<ActionResult<Explanation>> {
  const auth = await authorizeAction();
  if (!auth.ok) return auth;
  if (!isUuid(locationId) || !isUuid(productId)) return { ok: false, message: "対象の指定が正しくありません。" };

  const rows = await loadRecommendations(auth.context, { locationId, productId });
  const target = rows.find((item) => item.row.location_id === locationId && item.row.product_id === productId);
  if (!target) return { ok: false, message: "対象の商品が見つかりません。" };

  const context = {
    productName: target.row.product_name,
    unit: target.row.sales_unit,
    leadTimeDays: target.row.lead_time_days,
    supplierName: target.row.supplier_name,
    result: target.result,
  };

  if (!hasPermission(auth.context.role, "ai.explain")) {
    return {
      ok: true,
      message: "説明を表示しました。",
      data: { text: buildTemplateExplanation(target.result, context), source: "template", notice: "閲覧者ロールのため定型文で説明しています。" },
    };
  }

  const explanation = await explainRecommendation(context);
  return { ok: true, message: "説明を表示しました。", data: explanation };
}
