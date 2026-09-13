import type { RiskLevel } from "@/lib/domain/recommendation";

/** 画面表示用の日本語ラベルと状態バッジの色調 */

export type Tone = "neutral" | "info" | "success" | "warning" | "danger" | "critical";

export const STORAGE_TYPE_LABELS: Record<string, string> = {
  room_temperature: "常温",
  refrigerated: "冷蔵",
  frozen: "冷凍",
};

export const LOCATION_TYPE_LABELS: Record<string, string> = {
  store: "店舗",
  warehouse: "倉庫",
};

export const TRANSACTION_TYPE_LABELS: Record<string, string> = {
  receipt: "入庫",
  sale: "販売出庫",
  usage: "使用出庫",
  transfer_in: "移動入庫",
  transfer_out: "移動出庫",
  adjustment_plus: "調整（増）",
  adjustment_minus: "調整（減）",
  waste: "廃棄",
  stocktake_adjustment: "棚卸差異",
};

export const TRANSACTION_TYPE_TONES: Record<string, Tone> = {
  receipt: "success",
  sale: "info",
  usage: "info",
  transfer_in: "success",
  transfer_out: "neutral",
  adjustment_plus: "neutral",
  adjustment_minus: "neutral",
  waste: "danger",
  stocktake_adjustment: "warning",
};

export const ISSUE_TYPE_LABELS: Record<string, string> = {
  sale: "販売",
  usage: "使用・加工",
  transfer: "拠点間移動",
};

export const WASTE_REASON_LABELS: Record<string, string> = {
  expired: "期限切れ",
  damaged: "破損",
  quality_issue: "品質不良",
  overstock: "過剰在庫",
  other: "その他",
};

export const PO_STATUS_LABELS: Record<string, string> = {
  draft: "下書き",
  ordered: "発注済",
  partially_received: "一部入荷",
  received: "入荷完了",
  cancelled: "キャンセル",
};

export const PO_STATUS_TONES: Record<string, Tone> = {
  draft: "neutral",
  ordered: "info",
  partially_received: "warning",
  received: "success",
  cancelled: "neutral",
};

export const STOCKTAKE_STATUS_LABELS: Record<string, string> = {
  in_progress: "進行中",
  completed: "確定済",
  cancelled: "中止",
};

export const STOCKTAKE_STATUS_TONES: Record<string, Tone> = {
  in_progress: "warning",
  completed: "success",
  cancelled: "neutral",
};

export const LOT_STATUS_LABELS: Record<string, string> = {
  available: "使用可",
  expiring_soon: "期限間近",
  expired: "期限切れ",
  depleted: "消化済",
  quarantined: "隔離中",
};

export const LOT_STATUS_TONES: Record<string, Tone> = {
  available: "success",
  expiring_soon: "warning",
  expired: "danger",
  depleted: "neutral",
  quarantined: "critical",
};

export const STOCK_STATUS_LABELS: Record<string, string> = {
  out_of_stock: "欠品",
  low: "発注点以下",
  normal: "適正",
  overstock: "過剰",
  expiring: "期限間近あり",
  expired: "期限切れあり",
};

export const STOCK_STATUS_TONES: Record<string, Tone> = {
  out_of_stock: "critical",
  low: "warning",
  normal: "success",
  overstock: "info",
  expiring: "warning",
  expired: "danger",
};

export const RISK_TONES: Record<RiskLevel, Tone> = {
  low: "success",
  medium: "warning",
  high: "danger",
  critical: "critical",
};

export const RISK_LEVEL_LABELS: Record<RiskLevel, string> = {
  low: "低",
  medium: "中",
  high: "高",
  critical: "緊急",
};

export function label(map: Record<string, string>, key: string | null | undefined): string {
  if (!key) return "—";
  return map[key] ?? key;
}
