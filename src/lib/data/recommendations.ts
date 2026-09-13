import "server-only";

import type { OrgContext } from "@/lib/auth/context";
import { buildShortReason } from "@/lib/domain/reason-text";
import { RISK_ORDER, recommendOrder, type RecommendationResult } from "@/lib/domain/recommendation";
import { toRecommendationInput, type ReorderInputRow } from "@/lib/domain/reorder-input";
import { logDbError } from "@/lib/errors";
import { todayJst } from "@/lib/format";

export type RecommendationRow = {
  row: ReorderInputRow;
  result: RecommendationResult;
  shortReason: string;
};

/**
 * DB から入力データを 1 回の RPC で取得し、決定論的エンジンで判定する。
 * AI（生成モデル）はここでは使わない。
 */
export async function loadRecommendations(
  context: OrgContext,
  options: { locationId?: string; productId?: string } = {},
): Promise<RecommendationRow[]> {
  const { data, error } = await context.supabase.rpc("get_reorder_inputs", {
    p_organization_id: context.organization.id,
    p_location_id: options.locationId,
    p_product_id: options.productId,
  });
  if (error) {
    logDbError("get_reorder_inputs", error);
    throw new Error("発注判定データの読み込みに失敗しました。");
  }
  const today = todayJst();
  const settings = {
    today,
    reviewPeriodDays: context.organization.reviewPeriodDays,
    overstockDays: context.organization.overstockDays,
  };
  return data.map((raw) => {
    const row: ReorderInputRow = raw;
    const result = recommendOrder(toRecommendationInput(row, settings));
    return { row, result, shortReason: buildShortReason(result, row.sales_unit) };
  });
}

export function sortByUrgency(rows: RecommendationRow[]): RecommendationRow[] {
  return [...rows].sort(
    (a, b) =>
      RISK_ORDER[b.result.shortageRisk] - RISK_ORDER[a.result.shortageRisk] ||
      (a.result.daysOfStock ?? Number.POSITIVE_INFINITY) - (b.result.daysOfStock ?? Number.POSITIVE_INFINITY) ||
      a.row.sku.localeCompare(b.row.sku),
  );
}

/** 需要または安全在庫がある商品で、販売可能在庫がゼロ */
export function isStockout(item: RecommendationRow): boolean {
  return item.result.effectiveStock <= 0 && (item.result.averageDailyUsage > 0 || item.row.safety_stock > 0);
}
