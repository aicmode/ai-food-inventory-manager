/**
 * 決定論的な発注推奨エンジン。
 *
 * 発注数量・リスク判定はすべてこのモジュールの純粋関数で計算する。
 * 生成AIはこの結果（構造化データ）を説明文にするだけで、数量は決めない。
 */

export type RiskLevel = "low" | "medium" | "high" | "critical";

export const RISK_ORDER: Record<RiskLevel, number> = {
  low: 0,
  medium: 1,
  high: 2,
  critical: 3,
};

export type UsableLot = {
  quantity: number;
  /** YYYY-MM-DD。null は期限管理なし */
  expirationDate: string | null;
};

export type RecommendationInput = {
  /** 今日（Asia/Tokyo）の日付 YYYY-MM-DD */
  today: string;
  quantityOnHand: number;
  quantityReserved: number;
  /** 期限切れ（未廃棄）数量 */
  expiredQuantity: number;
  /** 隔離中数量 */
  quarantinedQuantity: number;
  /** 出庫可能ロット（期限内・隔離なし） */
  usableLots: UsableLot[];
  safetyStock: number;
  reorderPoint: number;
  minimumOrderQuantity: number;
  orderLotSize: number;
  unitsPerCase: number;
  leadTimeDays: number;
  shelfLifeDays: number | null;
  expirationWarningDays: number;
  /** 直近7日の出庫合計（販売・使用・移動出庫） */
  usage7d: number;
  /** 直近30日の出庫合計 */
  usage30d: number;
  /** 直近28日の曜日別出庫合計（0=日曜〜6=土曜） */
  usageByWeekday: number[];
  /** 取扱開始日（最初の入庫日）。新規商品の平均を過小評価しないために使う */
  firstReceivedDate: string | null;
  /** 直近30日の廃棄数量 */
  waste30d: number;
  /** 入荷予定（発注済・未入荷） */
  incomingQuantity: number;
  /** 発注サイクル（次回発注までの日数） */
  reviewPeriodDays: number;
  /** 過剰在庫とみなす在庫日数 */
  overstockDays: number;
};

export type ReasonCode =
  | "stockout_now"
  | "stockout_before_lead_time"
  | "below_safety_stock"
  | "below_reorder_point"
  | "coverage_short"
  | "incoming_covers"
  | "no_demand"
  | "expired_stock"
  | "expiring_unsellable"
  | "shelf_life_cap"
  | "waste_trend_reduction"
  | "lot_rounding"
  | "moq_applied"
  | "overstock"
  | "weekday_peak"
  | "trend_up"
  | "trend_down"
  | "quarantined_stock";

export type Reason = {
  code: ReasonCode;
  params: Record<string, number | string>;
};

export type RecommendationResult = {
  /** 1日あたり平均出庫（7日と30日の加重平均） */
  averageDailyUsage: number;
  average7d: number;
  average30d: number;
  /** 曜日補正係数（リードタイム+発注サイクル期間の平均） */
  weekdayFactor: number;
  /** 利用可能在庫 = 現在庫 - 引当 */
  availableStock: number;
  /** 販売可能在庫 = 利用可能在庫 - 期限切れ - 隔離 */
  usableStock: number;
  /** 期限までに消化できない見込み数量 */
  projectedExpiringLoss: number;
  /** 有効在庫 = 販売可能在庫 - 消化不能見込み */
  effectiveStock: number;
  /** 在庫ポジション = 有効在庫 + 入荷予定 */
  inventoryPosition: number;
  coverageDays: number;
  projectedDemand: number;
  targetStock: number;
  rawRecommendedQuantity: number;
  /** 賞味期限内に消化できる発注上限（期限管理なしは null） */
  shelfLifeCapQuantity: number | null;
  recommendedQuantity: number;
  /** 在庫日数（有効在庫 ÷ 日平均）。需要ゼロは null */
  daysOfStock: number | null;
  /** 欠品予測日（需要ゼロは null） */
  stockoutDate: string | null;
  needsReorder: boolean;
  isOverstock: boolean;
  shortageRisk: RiskLevel;
  wasteRisk: RiskLevel;
  wasteRate: number;
  reasons: Reason[];
};

const MS_PER_DAY = 86_400_000;

/** 浮動小数の誤差を抑えて丸める */
export function roundTo(value: number, digits = 3): number {
  const factor = 10 ** digits;
  return Math.round((value + Number.EPSILON) * factor) / factor;
}

export function daysBetween(from: string, to: string): number {
  const a = Date.parse(`${from}T00:00:00Z`);
  const b = Date.parse(`${to}T00:00:00Z`);
  return Math.round((b - a) / MS_PER_DAY);
}

export function addDays(date: string, days: number): string {
  const time = Date.parse(`${date}T00:00:00Z`) + days * MS_PER_DAY;
  return new Date(time).toISOString().slice(0, 10);
}

function weekdayOf(date: string): number {
  return new Date(`${date}T00:00:00Z`).getUTCDay();
}

function safeNumber(value: number): number {
  return Number.isFinite(value) ? value : 0;
}

/** 利用可能在庫 = 現在庫 - 引当済（負にはしない） */
export function calculateAvailableStock(onHand: number, reserved: number): number {
  return roundTo(Math.max(0, safeNumber(onHand) - safeNumber(reserved)));
}

/**
 * 平均日次出庫。
 * 新規商品は取扱日数で割り、直近の傾向を反映するため 7 日平均を 60% で加重する。
 */
export function calculateAverageDailyUsage(params: {
  usage7d: number;
  usage30d: number;
  today: string;
  firstReceivedDate: string | null;
}): { average7d: number; average30d: number; weighted: number } {
  const activeDays = params.firstReceivedDate
    ? Math.max(1, daysBetween(params.firstReceivedDate, params.today))
    : 30;
  const days7 = Math.min(7, activeDays);
  const days30 = Math.min(30, activeDays);
  const average7d = Math.max(0, safeNumber(params.usage7d)) / days7;
  const average30d = Math.max(0, safeNumber(params.usage30d)) / days30;

  let weighted: number;
  if (average7d === 0 && average30d === 0) {
    weighted = 0;
  } else if (activeDays <= 7) {
    weighted = average7d;
  } else {
    weighted = average7d * 0.6 + average30d * 0.4;
  }
  return { average7d: roundTo(average7d, 2), average30d: roundTo(average30d, 2), weighted: roundTo(weighted, 3) };
}

/**
 * 曜日補正係数。
 * 直近28日の曜日別出庫から、これからの [今日, 今日+日数) の期間における需要倍率を求める。
 * データが少ない場合や極端な値を避けるため 0.7〜1.4 に制限する。
 */
export function calculateWeekdayFactor(usageByWeekday: number[], today: string, days: number): number {
  if (usageByWeekday.length !== 7 || days <= 0) return 1;
  const total = usageByWeekday.reduce((sum, v) => sum + Math.max(0, safeNumber(v)), 0);
  if (total <= 0) return 1;
  const mean = total / 7;
  const start = weekdayOf(today);
  let sum = 0;
  for (let i = 0; i < days; i += 1) {
    sum += Math.max(0, safeNumber(usageByWeekday[(start + i) % 7])) / mean;
  }
  const factor = sum / days;
  return roundTo(Math.min(1.4, Math.max(0.7, factor)), 3);
}

/**
 * FEFO で消化した場合に、賞味期限までに消化しきれない見込み数量。
 * 期限日当日まで販売可能とし、日平均 × 期限までの日数 を各ロットに先入れで割り当てる。
 */
export function calculateProjectedExpiringLoss(lots: UsableLot[], averageDailyUsage: number, today: string): number {
  const sorted = [...lots]
    .filter((lot) => lot.quantity > 0)
    .sort((a, b) => {
      if (a.expirationDate === b.expirationDate) return 0;
      if (a.expirationDate === null) return 1;
      if (b.expirationDate === null) return -1;
      return a.expirationDate < b.expirationDate ? -1 : 1;
    });

  let consumedBefore = 0;
  let loss = 0;
  for (const lot of sorted) {
    if (lot.expirationDate === null) {
      consumedBefore += lot.quantity;
      continue;
    }
    const sellableDays = Math.max(0, daysBetween(today, lot.expirationDate) + 1);
    const capacity = Math.max(0, averageDailyUsage * sellableDays - consumedBefore);
    const consumed = Math.min(lot.quantity, capacity);
    loss += lot.quantity - consumed;
    consumedBefore += consumed;
  }
  return roundTo(loss);
}

/** 発注単位・最小発注数量に合わせて切り上げる */
export function roundOrderQuantity(
  quantity: number,
  options: { minimumOrderQuantity: number; orderLotSize: number },
): number {
  if (!Number.isFinite(quantity) || quantity <= 0) return 0;
  const lot = options.orderLotSize > 0 ? options.orderLotSize : 1;
  const moq = Math.max(0, safeNumber(options.minimumOrderQuantity));
  const base = Math.max(quantity, moq);
  // 浮動小数誤差（例: 36.0000001）で余計に1ロット増えないよう丸めてから切り上げる
  return roundTo(Math.ceil(roundTo(base / lot, 6)) * lot);
}

/** 発注単位で切り下げ（上限を超えないようにする） */
export function roundDownToLot(quantity: number, orderLotSize: number): number {
  if (!Number.isFinite(quantity) || quantity <= 0) return 0;
  const lot = orderLotSize > 0 ? orderLotSize : 1;
  return roundTo(Math.floor(roundTo(quantity / lot, 6)) * lot);
}

/** 発注数量が発注単位・最小発注数量と整合しているか */
export function isValidOrderQuantity(
  quantity: number,
  options: { minimumOrderQuantity: number; orderLotSize: number },
): boolean {
  if (!Number.isFinite(quantity) || quantity <= 0) return false;
  const lot = options.orderLotSize > 0 ? options.orderLotSize : 1;
  const ratio = roundTo(quantity / lot, 6);
  return Number.isInteger(ratio) && quantity >= options.minimumOrderQuantity;
}

export function maxRisk(...levels: RiskLevel[]): RiskLevel {
  return levels.reduce<RiskLevel>((acc, level) => (RISK_ORDER[level] > RISK_ORDER[acc] ? level : acc), "low");
}

/** 欠品リスク */
export function classifyShortageRisk(params: {
  averageDailyUsage: number;
  effectiveStock: number;
  inventoryPosition: number;
  safetyStock: number;
  reorderPoint: number;
  leadTimeDays: number;
  coverageDays: number;
}): RiskLevel {
  const { averageDailyUsage: avg, effectiveStock, inventoryPosition, safetyStock, reorderPoint } = params;
  if (avg <= 0) {
    if (effectiveStock <= 0 && safetyStock > 0) return inventoryPosition > 0 ? "medium" : "high";
    return "low";
  }
  const daysOfStock = effectiveStock / avg;
  if (effectiveStock <= 0) return inventoryPosition > 0 ? "high" : "critical";
  // 新しい発注が届く前に欠品し、入荷予定でも補えない
  if (daysOfStock < params.leadTimeDays && inventoryPosition < avg * params.leadTimeDays) return "critical";
  if (daysOfStock < params.leadTimeDays || inventoryPosition <= safetyStock) return "high";
  if (inventoryPosition <= reorderPoint || inventoryPosition / avg < params.coverageDays) return "medium";
  return "low";
}

/** 廃棄リスク */
export function classifyWasteRisk(params: {
  usableStock: number;
  expiredQuantity: number;
  projectedExpiringLoss: number;
  wasteRate: number;
  isOverstock: boolean;
}): RiskLevel {
  const lossRatio = params.usableStock > 0 ? params.projectedExpiringLoss / params.usableStock : 0;
  if (params.expiredQuantity > 0 || lossRatio >= 0.5) return "critical";
  if (lossRatio >= 0.2 || params.wasteRate >= 0.15) return "high";
  if (params.projectedExpiringLoss > 0 || params.wasteRate >= 0.05 || params.isOverstock) return "medium";
  return "low";
}

/** 廃棄率 = 廃棄数量 ÷ (出庫数量 + 廃棄数量) */
export function calculateWasteRate(wasteQuantity: number, outboundQuantity: number): number {
  const waste = Math.max(0, safeNumber(wasteQuantity));
  const outbound = Math.max(0, safeNumber(outboundQuantity));
  if (waste + outbound === 0) return 0;
  return roundTo(waste / (waste + outbound), 4);
}

/** 過剰在庫判定 */
export function isOverstocked(params: {
  usableStock: number;
  averageDailyUsage: number;
  reorderPoint: number;
  safetyStock: number;
  overstockDays: number;
  shelfLifeDays: number | null;
}): boolean {
  const threshold = Math.max(params.reorderPoint, params.safetyStock);
  if (params.usableStock <= threshold) return false;
  if (params.averageDailyUsage <= 0) {
    // 動きがないのに発注点の3倍以上抱えている
    return params.usableStock > Math.max(threshold * 3, 10);
  }
  const days = params.usableStock / params.averageDailyUsage;
  if (days > params.overstockDays) return true;
  return params.shelfLifeDays !== null && days > params.shelfLifeDays;
}

export function recommendOrder(input: RecommendationInput): RecommendationResult {
  const reasons: Reason[] = [];
  const leadTime = Math.max(0, Math.round(safeNumber(input.leadTimeDays)));
  const reviewPeriod = Math.max(0, Math.round(safeNumber(input.reviewPeriodDays)));
  const coverageDays = leadTime + reviewPeriod;

  const { average7d, average30d, weighted } = calculateAverageDailyUsage({
    usage7d: input.usage7d,
    usage30d: input.usage30d,
    today: input.today,
    firstReceivedDate: input.firstReceivedDate,
  });

  const weekdayFactor = calculateWeekdayFactor(input.usageByWeekday, input.today, Math.max(coverageDays, 1));
  const averageDailyUsage = roundTo(weighted, 3);

  const availableStock = calculateAvailableStock(input.quantityOnHand, input.quantityReserved);
  const usableStock = roundTo(
    Math.max(0, availableStock - Math.max(0, input.expiredQuantity) - Math.max(0, input.quarantinedQuantity)),
  );
  const projectedExpiringLoss = Math.min(
    usableStock,
    calculateProjectedExpiringLoss(input.usableLots, averageDailyUsage, input.today),
  );
  const effectiveStock = roundTo(Math.max(0, usableStock - projectedExpiringLoss));
  const incoming = Math.max(0, safeNumber(input.incomingQuantity));
  const inventoryPosition = roundTo(effectiveStock + incoming);

  const projectedDemand = roundTo(averageDailyUsage * weekdayFactor * coverageDays);
  const targetStock = roundTo(projectedDemand + input.safetyStock);
  const rawRecommendedQuantity = roundTo(Math.max(0, targetStock - effectiveStock - incoming));

  const daysOfStock = averageDailyUsage > 0 ? roundTo(effectiveStock / averageDailyUsage, 1) : null;
  const stockoutDate = daysOfStock !== null ? addDays(input.today, Math.floor(daysOfStock)) : null;

  const needsReorder =
    rawRecommendedQuantity > 0 &&
    (inventoryPosition <= input.reorderPoint ||
      inventoryPosition <= input.safetyStock ||
      (averageDailyUsage > 0 && inventoryPosition / averageDailyUsage < coverageDays));

  const wasteRate = calculateWasteRate(input.waste30d, input.usage30d);
  const isOverstock = isOverstocked({
    usableStock,
    averageDailyUsage,
    reorderPoint: input.reorderPoint,
    safetyStock: input.safetyStock,
    overstockDays: input.overstockDays,
    shelfLifeDays: input.shelfLifeDays,
  });

  // ---- 数量決定 ----
  let quantity = needsReorder ? rawRecommendedQuantity : 0;

  // 廃棄傾向が高い商品は安全在庫分の上乗せを抑える（最大30%減、ただし期間需要は割り込まない）
  if (quantity > 0 && wasteRate >= 0.1) {
    const reduction = Math.min(0.3, wasteRate);
    const floor = Math.max(0, projectedDemand - effectiveStock - incoming);
    const reduced = roundTo(Math.max(floor, quantity * (1 - reduction)));
    if (reduced < quantity) {
      reasons.push({
        code: "waste_trend_reduction",
        params: { wasteRatePercent: roundTo(wasteRate * 100, 1), before: quantity, after: reduced },
      });
      quantity = reduced;
    }
  }

  // 賞味期限内に消化できる上限
  let shelfLifeCapQuantity: number | null = null;
  if (input.shelfLifeDays !== null && input.shelfLifeDays > 0) {
    // 入荷後、賞味期間の 80% までに販売し切る前提
    const sellableDaysAfterArrival = Math.max(1, Math.floor(input.shelfLifeDays * 0.8));
    const cap = averageDailyUsage * weekdayFactor * (leadTime + sellableDaysAfterArrival) - effectiveStock - incoming;
    shelfLifeCapQuantity = roundTo(Math.max(0, cap));
  }

  const lotOptions = { minimumOrderQuantity: input.minimumOrderQuantity, orderLotSize: input.orderLotSize };
  let recommendedQuantity = 0;

  if (quantity > 0) {
    if (shelfLifeCapQuantity !== null && quantity > shelfLifeCapQuantity) {
      reasons.push({ code: "shelf_life_cap", params: { before: quantity, cap: shelfLifeCapQuantity, shelfLifeDays: input.shelfLifeDays ?? 0 } });
      quantity = shelfLifeCapQuantity;
    }

    const rounded = roundOrderQuantity(quantity, lotOptions);
    if (shelfLifeCapQuantity !== null && rounded > shelfLifeCapQuantity) {
      // 切り上げると期限内に消化できない。切り下げで最小発注数量を満たせればそちらを採用
      const roundedDown = roundDownToLot(shelfLifeCapQuantity, input.orderLotSize);
      const stockoutImminent = averageDailyUsage > 0 && effectiveStock / averageDailyUsage < leadTime;
      if (roundedDown > 0 && roundedDown >= input.minimumOrderQuantity) {
        recommendedQuantity = roundedDown;
      } else if (stockoutImminent || effectiveStock <= 0) {
        // 欠品回避を優先し、最小単位で発注（廃棄リスクは理由に明記）
        recommendedQuantity = rounded;
      } else {
        recommendedQuantity = 0;
      }
    } else {
      recommendedQuantity = rounded;
    }

    if (recommendedQuantity > 0 && recommendedQuantity !== roundTo(quantity)) {
      if (input.minimumOrderQuantity > 0 && quantity < input.minimumOrderQuantity && recommendedQuantity >= input.minimumOrderQuantity) {
        reasons.push({ code: "moq_applied", params: { before: roundTo(quantity, 1), moq: input.minimumOrderQuantity } });
      }
      reasons.push({
        code: "lot_rounding",
        params: {
          before: roundTo(quantity, 1),
          after: recommendedQuantity,
          lotSize: input.orderLotSize,
          cases: input.unitsPerCase > 1 ? roundTo(recommendedQuantity / input.unitsPerCase, 2) : 0,
        },
      });
    }
  }

  const shortageRisk = classifyShortageRisk({
    averageDailyUsage,
    effectiveStock,
    inventoryPosition,
    safetyStock: input.safetyStock,
    reorderPoint: input.reorderPoint,
    leadTimeDays: leadTime,
    coverageDays,
  });

  const wasteRisk = classifyWasteRisk({
    usableStock,
    expiredQuantity: input.expiredQuantity,
    projectedExpiringLoss,
    wasteRate,
    isOverstock,
  });

  // ---- 理由（先頭ほど重要） ----
  const primary: Reason[] = [];
  if (averageDailyUsage <= 0) {
    primary.push({ code: "no_demand", params: {} });
  } else if (effectiveStock <= 0) {
    primary.push({ code: "stockout_now", params: { averageDailyUsage } });
  } else if (daysOfStock !== null && daysOfStock < leadTime) {
    primary.push({ code: "stockout_before_lead_time", params: { averageDailyUsage, daysOfStock, leadTimeDays: leadTime } });
  } else if (daysOfStock !== null && needsReorder) {
    primary.push({ code: "coverage_short", params: { averageDailyUsage, daysOfStock, coverageDays } });
  }
  if (needsReorder && inventoryPosition <= input.safetyStock) {
    primary.push({ code: "below_safety_stock", params: { position: inventoryPosition, safetyStock: input.safetyStock } });
  } else if (needsReorder && inventoryPosition <= input.reorderPoint) {
    primary.push({ code: "below_reorder_point", params: { position: inventoryPosition, reorderPoint: input.reorderPoint } });
  }
  if (incoming > 0) {
    primary.push({ code: "incoming_covers", params: { incoming, covers: needsReorder ? 0 : 1 } });
  }
  if (averageDailyUsage > 0 && average7d > average30d * 1.2) {
    primary.push({ code: "trend_up", params: { average7d, average30d } });
  } else if (averageDailyUsage > 0 && average7d < average30d * 0.8) {
    primary.push({ code: "trend_down", params: { average7d, average30d } });
  }
  if (weekdayFactor >= 1.1) {
    primary.push({ code: "weekday_peak", params: { factor: weekdayFactor } });
  }
  if (input.expiredQuantity > 0) {
    primary.push({ code: "expired_stock", params: { quantity: input.expiredQuantity } });
  }
  if (input.quarantinedQuantity > 0) {
    primary.push({ code: "quarantined_stock", params: { quantity: input.quarantinedQuantity } });
  }
  if (projectedExpiringLoss > 0) {
    primary.push({ code: "expiring_unsellable", params: { quantity: projectedExpiringLoss } });
  }
  if (isOverstock) {
    primary.push({ code: "overstock", params: { daysOfStock: daysOfStock ?? 0, overstockDays: input.overstockDays } });
  }

  return {
    averageDailyUsage,
    average7d,
    average30d,
    weekdayFactor,
    availableStock,
    usableStock,
    projectedExpiringLoss,
    effectiveStock,
    inventoryPosition,
    coverageDays,
    projectedDemand,
    targetStock,
    rawRecommendedQuantity,
    shelfLifeCapQuantity,
    recommendedQuantity,
    daysOfStock,
    stockoutDate,
    needsReorder: recommendedQuantity > 0,
    isOverstock,
    shortageRisk,
    wasteRisk,
    wasteRate,
    reasons: [...primary, ...reasons],
  };
}
