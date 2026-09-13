/**
 * 在庫ドメインの純粋関数（FEFO 割当・ロット状態・在庫状態・発注金額・状態遷移）。
 * DB 側の RPC と同じ規則を TypeScript でも表現し、テストと UI 表示に使う。
 */

export type LotStatus = "available" | "expiring_soon" | "expired" | "depleted" | "quarantined";

export type FefoLot = {
  id: string;
  quantityRemaining: number;
  expirationDate: string | null;
  receivedDate: string;
  status: "available" | "depleted" | "quarantined";
};

export type FefoAllocation = { lotId: string; quantity: number };

export type FefoResult =
  | { ok: true; allocations: FefoAllocation[] }
  | { ok: false; shortage: number; allocations: FefoAllocation[] };

/** 期限切れ判定: 賞味期限日の翌日から期限切れ（当日までは販売可能） */
export function isExpired(expirationDate: string | null, today: string): boolean {
  return expirationDate !== null && expirationDate < today;
}

/**
 * FEFO（First Expired, First Out）で出庫ロットを割り当てる。
 * - 期限切れ・隔離・残数0のロットは対象外
 * - 期限の早い順、同じ期限なら入庫日の早い順。期限なしは最後
 * - 在庫不足の場合は ok: false（負の在庫は作らない）
 */
export function allocateFefo(lots: FefoLot[], quantity: number, today: string): FefoResult {
  if (!Number.isFinite(quantity) || quantity <= 0) {
    throw new RangeError("出庫数量は0より大きい数値を指定してください。");
  }
  const candidates = lots
    .filter((lot) => lot.status === "available" && lot.quantityRemaining > 0 && !isExpired(lot.expirationDate, today))
    .sort((a, b) => {
      if (a.expirationDate !== b.expirationDate) {
        if (a.expirationDate === null) return 1;
        if (b.expirationDate === null) return -1;
        return a.expirationDate < b.expirationDate ? -1 : 1;
      }
      if (a.receivedDate !== b.receivedDate) return a.receivedDate < b.receivedDate ? -1 : 1;
      return a.id < b.id ? -1 : 1;
    });

  let remaining = quantity;
  const allocations: FefoAllocation[] = [];
  for (const lot of candidates) {
    if (remaining <= 0) break;
    const take = Math.min(remaining, lot.quantityRemaining);
    allocations.push({ lotId: lot.id, quantity: take });
    remaining = Math.round((remaining - take) * 1000) / 1000;
  }

  if (remaining > 0) return { ok: false, shortage: remaining, allocations };
  return { ok: true, allocations };
}

/** 表示用ロット状態（expiring_soon / expired は日付から導出） */
export function deriveLotStatus(params: {
  status: "available" | "depleted" | "quarantined" | LotStatus;
  quantityRemaining: number;
  expirationDate: string | null;
  today: string;
  warningDays: number;
}): LotStatus {
  if (params.status === "quarantined") return "quarantined";
  if (params.quantityRemaining <= 0) return "depleted";
  if (params.expirationDate === null) return "available";
  if (params.expirationDate < params.today) return "expired";
  const warningLimit = new Date(`${params.today}T00:00:00Z`);
  warningLimit.setUTCDate(warningLimit.getUTCDate() + Math.max(0, params.warningDays));
  if (params.expirationDate <= warningLimit.toISOString().slice(0, 10)) return "expiring_soon";
  return "available";
}

export type StockStatus = "out_of_stock" | "low" | "normal" | "overstock";

/** 一覧表示用の在庫状態（DB の search_products と同じ規則） */
export function classifyStockStatus(params: {
  available: number;
  reorderPoint: number;
  safetyStock: number;
  averageDailyUsage: number;
  overstockDays: number;
}): StockStatus {
  if (params.available <= 0) return "out_of_stock";
  if (params.available <= Math.max(params.reorderPoint, params.safetyStock)) return "low";
  if (params.averageDailyUsage > 0 && params.available / params.averageDailyUsage > params.overstockDays) {
    return "overstock";
  }
  return "normal";
}

export type WasteSummary = {
  quantity: number;
  amount: number;
  /** 廃棄率 = 廃棄数量 ÷ (出庫数量 + 廃棄数量) */
  rate: number;
};

/** 廃棄金額（ロット単価 × 数量、1円未満四捨五入）と廃棄率 */
export function summarizeWaste(
  records: { quantity: number; unitCost: number }[],
  outboundQuantity: number,
): WasteSummary {
  let quantity = 0;
  let amount = 0;
  for (const record of records) {
    if (!Number.isFinite(record.quantity) || record.quantity <= 0) continue;
    quantity += record.quantity;
    amount += Math.round(record.quantity * Math.max(0, record.unitCost) * 100) / 100;
  }
  const outbound = Math.max(0, outboundQuantity);
  const rate = quantity + outbound === 0 ? 0 : Math.round((quantity / (quantity + outbound)) * 10000) / 10000;
  return { quantity: Math.round(quantity * 1000) / 1000, amount: Math.round(amount), rate };
}

export type OrderLine = { quantity: number; unitCost: number; taxRate: number };

export type OrderTotals = { subtotal: number; taxAmount: number; totalAmount: number };

/**
 * 発注金額。明細小計は円未満2桁で丸め、消費税は税率ごとに合計してから切り捨て（DB と同じ規則）。
 */
export function calculatePurchaseOrderTotals(lines: OrderLine[]): OrderTotals {
  const byRate = new Map<number, number>();
  for (const line of lines) {
    const lineSubtotal = Math.round(line.quantity * line.unitCost * 100) / 100;
    byRate.set(line.taxRate, (byRate.get(line.taxRate) ?? 0) + lineSubtotal);
  }
  let subtotal = 0;
  let taxAmount = 0;
  for (const [rate, amount] of byRate) {
    subtotal += amount;
    taxAmount += Math.floor((Math.round(amount * 100) * rate) / 10000);
  }
  subtotal = Math.round(subtotal * 100) / 100;
  return { subtotal, taxAmount, totalAmount: Math.round((subtotal + taxAmount) * 100) / 100 };
}

export type PurchaseOrderStatus = "draft" | "ordered" | "partially_received" | "received" | "cancelled";

/** ユーザー操作による発注状態の遷移可否（入荷による遷移は入庫処理が行う） */
export function canTransitionPurchaseOrder(
  from: PurchaseOrderStatus,
  to: PurchaseOrderStatus,
  hasReceivedItems: boolean,
): boolean {
  if (from === "draft" && to === "ordered") return true;
  if ((from === "draft" || from === "ordered") && to === "cancelled") return !hasReceivedItems;
  return false;
}

/** 入荷後の発注状態 */
export function statusAfterReceipt(items: { orderedQuantity: number; receivedQuantity: number }[]): PurchaseOrderStatus {
  const anyReceived = items.some((item) => item.receivedQuantity > 0);
  const allReceived = items.every((item) => item.receivedQuantity >= item.orderedQuantity);
  if (allReceived) return "received";
  return anyReceived ? "partially_received" : "ordered";
}

/** 仕入先ごとに発注明細を分割 */
export function groupBySupplier<T extends { supplierId: string | null }>(
  items: T[],
): { groups: Map<string, T[]>; missingSupplier: T[] } {
  const groups = new Map<string, T[]>();
  const missingSupplier: T[] = [];
  for (const item of items) {
    if (!item.supplierId) {
      missingSupplier.push(item);
      continue;
    }
    const list = groups.get(item.supplierId) ?? [];
    list.push(item);
    groups.set(item.supplierId, list);
  }
  return { groups, missingSupplier };
}
