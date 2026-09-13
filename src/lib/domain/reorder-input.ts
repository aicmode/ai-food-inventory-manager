import type { RecommendationInput, UsableLot } from "./recommendation";

/**
 * get_reorder_inputs RPC の行 → 推奨エンジン入力への変換（アプリと seed で共有）。
 * RPC の戻り値は JSON 由来のため、型を信用せず実行時に検証する。
 */

export type ReorderInputRow = {
  location_id: string;
  location_name: string;
  product_id: string;
  sku: string;
  product_name: string;
  jan_code: string | null;
  category_name: string | null;
  sales_unit: string;
  storage_type: string;
  units_per_case: number;
  cost_price: number;
  safety_stock: number;
  reorder_point: number;
  standard_order_quantity: number;
  minimum_order_quantity: number;
  order_lot_size: number;
  lead_time_days: number;
  shelf_life_days: number | null;
  expiration_warning_days: number;
  supplier_id: string | null;
  supplier_name: string | null;
  quantity_on_hand: number;
  quantity_reserved: number;
  quantity_available: number;
  expired_quantity: number;
  quarantined_quantity: number;
  usable_lots: unknown;
  usage_7d: number;
  usage_30d: number;
  usage_by_weekday: unknown;
  first_received_date: string | null;
  waste_30d: number;
  incoming_quantity: number;
  next_delivery_date: string | null;
};

function num(value: unknown): number {
  const n = typeof value === "number" ? value : typeof value === "string" ? Number(value) : Number.NaN;
  return Number.isFinite(n) ? n : 0;
}

export function parseUsableLots(value: unknown): UsableLot[] {
  if (!Array.isArray(value)) return [];
  const lots: UsableLot[] = [];
  for (const entry of value) {
    if (typeof entry !== "object" || entry === null) continue;
    const record = entry as Record<string, unknown>;
    const quantity = num(record.quantity);
    const expiration = typeof record.expiration_date === "string" ? record.expiration_date : null;
    if (quantity > 0) lots.push({ quantity, expirationDate: expiration });
  }
  return lots;
}

export function parseWeekdayUsage(value: unknown): number[] {
  if (!Array.isArray(value) || value.length !== 7) return [0, 0, 0, 0, 0, 0, 0];
  return value.map((v) => Math.max(0, num(v)));
}

export function toRecommendationInput(
  row: ReorderInputRow,
  settings: { today: string; reviewPeriodDays: number; overstockDays: number },
): RecommendationInput {
  return {
    today: settings.today,
    quantityOnHand: num(row.quantity_on_hand),
    quantityReserved: num(row.quantity_reserved),
    expiredQuantity: num(row.expired_quantity),
    quarantinedQuantity: num(row.quarantined_quantity),
    usableLots: parseUsableLots(row.usable_lots),
    safetyStock: num(row.safety_stock),
    reorderPoint: num(row.reorder_point),
    minimumOrderQuantity: num(row.minimum_order_quantity),
    orderLotSize: num(row.order_lot_size) > 0 ? num(row.order_lot_size) : 1,
    unitsPerCase: Math.max(1, num(row.units_per_case)),
    leadTimeDays: num(row.lead_time_days),
    shelfLifeDays: row.shelf_life_days === null ? null : num(row.shelf_life_days) || null,
    expirationWarningDays: num(row.expiration_warning_days),
    usage7d: num(row.usage_7d),
    usage30d: num(row.usage_30d),
    usageByWeekday: parseWeekdayUsage(row.usage_by_weekday),
    firstReceivedDate: row.first_received_date,
    waste30d: num(row.waste_30d),
    incomingQuantity: num(row.incoming_quantity),
    reviewPeriodDays: settings.reviewPeriodDays,
    overstockDays: settings.overstockDays,
  };
}
