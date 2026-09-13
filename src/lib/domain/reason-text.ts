import type { Reason, RecommendationResult, RiskLevel } from "./recommendation";

/**
 * 推奨理由（構造化データ）を日本語の定型文に変換する。
 * AI API が使えない場合も、この決定論的テンプレートで説明を表示する。
 */

const nf = new Intl.NumberFormat("ja-JP", { maximumFractionDigits: 1 });
const n = (value: number | string | undefined): string =>
  typeof value === "number" ? nf.format(value) : String(value ?? "");

export const RISK_LABELS: Record<RiskLevel, string> = {
  low: "低",
  medium: "中",
  high: "高",
  critical: "緊急",
};

export function reasonToText(reason: Reason, unit: string): string {
  const p = reason.params;
  switch (reason.code) {
    case "stockout_now":
      return `販売可能な在庫がありません（平均出庫 1日${n(p.averageDailyUsage)}${unit}）。`;
    case "stockout_before_lead_time":
      return `平均出庫は1日${n(p.averageDailyUsage)}${unit}で、在庫は約${n(p.daysOfStock)}日分です。リードタイム${n(p.leadTimeDays)}日より先に欠品する見込みです。`;
    case "coverage_short":
      return `平均出庫は1日${n(p.averageDailyUsage)}${unit}で、在庫は約${n(p.daysOfStock)}日分です。入荷と次回発注までの${n(p.coverageDays)}日分に足りません。`;
    case "below_safety_stock":
      return `有効在庫と入荷予定の合計（${n(p.position)}${unit}）が安全在庫（${n(p.safetyStock)}${unit}）以下です。`;
    case "below_reorder_point":
      return `有効在庫と入荷予定の合計（${n(p.position)}${unit}）が発注点（${n(p.reorderPoint)}${unit}）以下です。`;
    case "incoming_covers":
      return p.covers === 1
        ? `入荷予定${n(p.incoming)}${unit}で当面の需要をまかなえる見込みです。`
        : `入荷予定${n(p.incoming)}${unit}を差し引いて計算しています。`;
    case "no_demand":
      return "直近30日の出庫実績がありません。";
    case "expired_stock":
      return `期限切れ在庫が${n(p.quantity)}${unit}あります（販売可能在庫から除外）。廃棄登録を検討してください。`;
    case "quarantined_stock":
      return `隔離中の在庫${n(p.quantity)}${unit}は販売可能在庫から除外しています。`;
    case "expiring_unsellable":
      return `賞味期限までに販売しきれない見込みの在庫が${n(p.quantity)}${unit}あります（有効在庫から除外）。`;
    case "shelf_life_cap":
      return `賞味期間（${n(p.shelfLifeDays)}日）内に販売できる量に抑えるため、${n(p.before)}${unit}を${n(p.cap)}${unit}までに制限しました。`;
    case "waste_trend_reduction":
      return `直近30日の廃棄率が${n(p.wasteRatePercent)}%と高いため、推奨数を${n(p.before)}${unit}から${n(p.after)}${unit}に抑えました。`;
    case "lot_rounding": {
      const cases = typeof p.cases === "number" && p.cases > 0 ? `（${n(p.cases)}ケース）` : "";
      return `発注単位${n(p.lotSize)}${unit}に合わせて${n(p.before)}${unit}を${n(p.after)}${unit}${cases}に調整しています。`;
    }
    case "moq_applied":
      return `最小発注数量${n(p.moq)}${unit}を適用しています。`;
    case "overstock":
      return `在庫日数が約${n(p.daysOfStock)}日で、過剰在庫の目安（${n(p.overstockDays)}日）を超えています。`;
    case "weekday_peak":
      return `今後の期間は曜日傾向により、需要が平常時の約${n(p.factor)}倍になる見込みです。`;
    case "trend_up":
      return `直近7日平均（${n(p.average7d)}${unit}/日）が30日平均（${n(p.average30d)}${unit}/日）を上回り、需要が増えています。`;
    case "trend_down":
      return `直近7日平均（${n(p.average7d)}${unit}/日）が30日平均（${n(p.average30d)}${unit}/日）を下回り、需要が減っています。`;
  }
}

/** 一覧に表示する短い理由（最重要の1〜2件） */
export function buildShortReason(result: RecommendationResult, unit: string): string {
  if (result.reasons.length === 0) return "在庫は適正水準です。";
  return result.reasons
    .slice(0, 2)
    .map((reason) => reasonToText(reason, unit))
    .join("");
}

/** テンプレートによる説明文（AI 未設定時・AI 失敗時のフォールバック） */
export function buildTemplateExplanation(
  result: RecommendationResult,
  context: { productName: string; unit: string; leadTimeDays: number; supplierName: string | null },
): string {
  const { unit } = context;
  const lines = result.reasons.map((reason) => reasonToText(reason, unit));

  let conclusion: string;
  if (result.recommendedQuantity > 0) {
    const purpose =
      result.shortageRisk === "critical" || result.shortageRisk === "high" ? "欠品を避けるため" : "在庫を適正に保つため";
    const supplier = context.supplierName ? `仕入先「${context.supplierName}」の` : "";
    conclusion = `${supplier}リードタイム${n(context.leadTimeDays)}日を考慮し、${purpose}${n(result.recommendedQuantity)}${unit}の発注を推奨します。`;
  } else if (result.isOverstock) {
    conclusion = "在庫が過剰なため、今回の発注は不要です。販促や他拠点への移動を検討してください。";
  } else if (result.averageDailyUsage <= 0) {
    conclusion = "出庫実績がないため、今回の発注は不要と判断しました。";
  } else {
    conclusion = "現在の在庫と入荷予定で需要をまかなえるため、今回の発注は不要です。";
  }

  return [`【${context.productName}】`, ...lines, conclusion].join("\n");
}
