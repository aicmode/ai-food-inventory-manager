import { describe, expect, it } from "vitest";

import {
  calculateAvailableStock,
  calculateAverageDailyUsage,
  calculateProjectedExpiringLoss,
  calculateWasteRate,
  calculateWeekdayFactor,
  classifyShortageRisk,
  classifyWasteRisk,
  isOverstocked,
  isValidOrderQuantity,
  recommendOrder,
  roundDownToLot,
  roundOrderQuantity,
  type RecommendationInput,
} from "./recommendation";

const base: RecommendationInput = {
  today: "2026-09-13",
  quantityOnHand: 20,
  quantityReserved: 0,
  expiredQuantity: 0,
  quarantinedQuantity: 0,
  usableLots: [{ quantity: 20, expirationDate: "2026-12-31" }],
  safetyStock: 10,
  reorderPoint: 25,
  minimumOrderQuantity: 0,
  orderLotSize: 1,
  unitsPerCase: 1,
  leadTimeDays: 3,
  shelfLifeDays: null,
  expirationWarningDays: 3,
  usage7d: 70,
  usage30d: 300,
  usageByWeekday: [40, 40, 40, 40, 40, 40, 40],
  firstReceivedDate: null,
  waste30d: 0,
  incomingQuantity: 0,
  reviewPeriodDays: 0,
  overstockDays: 45,
};

const codes = (input: RecommendationInput) => recommendOrder(input).reasons.map((r) => r.code);

describe("発注推奨数量（基本式）", () => {
  it("projected_demand = 日平均 × リードタイム、target = 需要 + 安全在庫、推奨 = target - 利用可能 - 入荷予定", () => {
    const result = recommendOrder(base);
    expect(result.averageDailyUsage).toBe(10);
    expect(result.projectedDemand).toBe(30);
    expect(result.targetStock).toBe(40);
    expect(result.rawRecommendedQuantity).toBe(20);
    expect(result.recommendedQuantity).toBe(20);
    expect(result.needsReorder).toBe(true);
  });

  it("推奨数が負になる場合は 0", () => {
    const result = recommendOrder({
      ...base,
      quantityOnHand: 500,
      usableLots: [{ quantity: 500, expirationDate: null }],
      reorderPoint: 25,
    });
    expect(result.rawRecommendedQuantity).toBe(0);
    expect(result.recommendedQuantity).toBe(0);
  });

  it("発注サイクル（review period）を需要期間に加える", () => {
    const result = recommendOrder({ ...base, reviewPeriodDays: 4 });
    expect(result.coverageDays).toBe(7);
    expect(result.projectedDemand).toBe(70);
    expect(result.recommendedQuantity).toBe(60);
  });

  it("入荷予定で在庫ポジションが足りる場合は発注しない", () => {
    const result = recommendOrder({ ...base, incomingQuantity: 15 });
    expect(result.inventoryPosition).toBe(35);
    expect(result.recommendedQuantity).toBe(0);
    expect(result.reasons.find((r) => r.code === "incoming_covers")?.params.covers).toBe(1);
  });

  it("入荷予定は推奨数から差し引く", () => {
    const result = recommendOrder({ ...base, incomingQuantity: 5 });
    expect(result.rawRecommendedQuantity).toBe(15);
    expect(result.recommendedQuantity).toBe(15);
  });

  it("引当済み数量は利用可能在庫から除外する", () => {
    const result = recommendOrder({ ...base, quantityReserved: 5, usableLots: [{ quantity: 20, expirationDate: null }] });
    expect(result.availableStock).toBe(15);
    expect(result.recommendedQuantity).toBe(25);
  });
});

describe("発注単位・最小発注数量", () => {
  it("発注単位（ケース）の倍数に切り上げる", () => {
    const result = recommendOrder({ ...base, orderLotSize: 12, unitsPerCase: 12 });
    expect(result.recommendedQuantity).toBe(24);
    const rounding = result.reasons.find((r) => r.code === "lot_rounding");
    expect(rounding?.params).toMatchObject({ before: 20, after: 24, lotSize: 12, cases: 2 });
  });

  it("最小発注数量を下回る場合は最小発注数量まで引き上げ、さらに発注単位に合わせる", () => {
    const result = recommendOrder({ ...base, minimumOrderQuantity: 48, orderLotSize: 12 });
    expect(result.recommendedQuantity).toBe(48);
    expect(codes({ ...base, minimumOrderQuantity: 48, orderLotSize: 12 })).toContain("moq_applied");
  });

  it("roundOrderQuantity", () => {
    expect(roundOrderQuantity(0, { minimumOrderQuantity: 10, orderLotSize: 6 })).toBe(0);
    expect(roundOrderQuantity(-3, { minimumOrderQuantity: 0, orderLotSize: 6 })).toBe(0);
    expect(roundOrderQuantity(Number.NaN, { minimumOrderQuantity: 0, orderLotSize: 6 })).toBe(0);
    expect(roundOrderQuantity(1, { minimumOrderQuantity: 0, orderLotSize: 12 })).toBe(12);
    expect(roundOrderQuantity(12, { minimumOrderQuantity: 0, orderLotSize: 12 })).toBe(12);
    expect(roundOrderQuantity(13, { minimumOrderQuantity: 0, orderLotSize: 12 })).toBe(24);
    expect(roundOrderQuantity(5, { minimumOrderQuantity: 10, orderLotSize: 1 })).toBe(10);
    expect(roundOrderQuantity(7, { minimumOrderQuantity: 10, orderLotSize: 6 })).toBe(12);
    // 浮動小数誤差で余分に1ロット増えない
    expect(roundOrderQuantity(36.0000001, { minimumOrderQuantity: 0, orderLotSize: 12 })).toBe(36);
    expect(roundOrderQuantity(0.3, { minimumOrderQuantity: 0, orderLotSize: 0.1 })).toBe(0.3);
  });

  it("roundDownToLot / isValidOrderQuantity", () => {
    expect(roundDownToLot(59, 12)).toBe(48);
    expect(roundDownToLot(11, 12)).toBe(0);
    expect(isValidOrderQuantity(24, { minimumOrderQuantity: 12, orderLotSize: 12 })).toBe(true);
    expect(isValidOrderQuantity(18, { minimumOrderQuantity: 12, orderLotSize: 12 })).toBe(false);
    expect(isValidOrderQuantity(6, { minimumOrderQuantity: 12, orderLotSize: 6 })).toBe(false);
    expect(isValidOrderQuantity(0, { minimumOrderQuantity: 0, orderLotSize: 1 })).toBe(false);
  });
});

describe("欠品判定", () => {
  it("リードタイム内に欠品し入荷予定でも補えない場合は critical", () => {
    const result = recommendOrder({ ...base, quantityOnHand: 5, usableLots: [{ quantity: 5, expirationDate: null }] });
    expect(result.shortageRisk).toBe("critical");
    expect(result.daysOfStock).toBe(0.5);
    expect(result.stockoutDate).toBe("2026-09-13");
    expect(result.reasons[0].code).toBe("stockout_before_lead_time");
  });

  it("在庫ゼロで需要がある場合は critical", () => {
    const result = recommendOrder({ ...base, quantityOnHand: 0, usableLots: [] });
    expect(result.shortageRisk).toBe("critical");
    expect(result.reasons[0].code).toBe("stockout_now");
  });

  it("在庫ゼロでも入荷予定がある場合は high", () => {
    const result = recommendOrder({ ...base, quantityOnHand: 0, usableLots: [], incomingQuantity: 50 });
    expect(result.shortageRisk).toBe("high");
  });

  it("十分な在庫があれば low", () => {
    expect(
      classifyShortageRisk({
        averageDailyUsage: 5,
        effectiveStock: 100,
        inventoryPosition: 100,
        safetyStock: 10,
        reorderPoint: 20,
        leadTimeDays: 3,
        coverageDays: 6,
      }),
    ).toBe("low");
  });

  it("発注点以下は medium", () => {
    expect(
      classifyShortageRisk({
        averageDailyUsage: 1,
        effectiveStock: 15,
        inventoryPosition: 15,
        safetyStock: 5,
        reorderPoint: 20,
        leadTimeDays: 3,
        coverageDays: 6,
      }),
    ).toBe("medium");
  });

  it("需要ゼロ・在庫ゼロ・安全在庫ありは安全在庫まで補充し high", () => {
    const result = recommendOrder({
      ...base,
      quantityOnHand: 0,
      usableLots: [],
      usage7d: 0,
      usage30d: 0,
      usageByWeekday: [0, 0, 0, 0, 0, 0, 0],
      reorderPoint: 10,
    });
    expect(result.recommendedQuantity).toBe(10);
    expect(result.shortageRisk).toBe("high");
  });

  it("需要ゼロで在庫ありは発注不要", () => {
    const input = {
      ...base,
      quantityOnHand: 5,
      usableLots: [{ quantity: 5, expirationDate: "2026-12-31" }],
      usage7d: 0,
      usage30d: 0,
      usageByWeekday: [0, 0, 0, 0, 0, 0, 0],
      safetyStock: 0,
      reorderPoint: 0,
    };
    const result = recommendOrder(input);
    expect(result.recommendedQuantity).toBe(0);
    expect(result.shortageRisk).toBe("low");
    expect(result.stockoutDate).toBeNull();
    expect(result.reasons[0].code).toBe("no_demand");
  });
});

describe("過剰在庫判定", () => {
  it("在庫日数が目安を超えると過剰在庫で、発注しない", () => {
    const result = recommendOrder({
      ...base,
      usage7d: 7,
      usage30d: 30,
      quantityOnHand: 100,
      usableLots: [{ quantity: 100, expirationDate: null }],
      reorderPoint: 10,
      safetyStock: 5,
    });
    expect(result.isOverstock).toBe(true);
    expect(result.recommendedQuantity).toBe(0);
    expect(result.wasteRisk).toBe("medium");
    expect(result.reasons.map((r) => r.code)).toContain("overstock");
  });

  it("賞味期間を超える在庫日数も過剰在庫", () => {
    expect(
      isOverstocked({ usableStock: 40, averageDailyUsage: 2, reorderPoint: 10, safetyStock: 5, overstockDays: 45, shelfLifeDays: 14 }),
    ).toBe(true);
  });

  it("発注点以下は過剰在庫にならない", () => {
    expect(
      isOverstocked({ usableStock: 10, averageDailyUsage: 0.01, reorderPoint: 10, safetyStock: 5, overstockDays: 45, shelfLifeDays: null }),
    ).toBe(false);
  });

  it("動きのない商品は発注点の3倍超で過剰在庫", () => {
    expect(
      isOverstocked({ usableStock: 31, averageDailyUsage: 0, reorderPoint: 10, safetyStock: 0, overstockDays: 45, shelfLifeDays: null }),
    ).toBe(true);
  });
});

describe("賞味期限リスク（expiration risk）", () => {
  it("期限までに消化しきれない数量を FEFO で見積もる", () => {
    expect(calculateProjectedExpiringLoss([{ quantity: 30, expirationDate: "2026-09-17" }], 2, "2026-09-13")).toBe(20);
    expect(
      calculateProjectedExpiringLoss(
        [
          { quantity: 10, expirationDate: "2026-09-15" },
          { quantity: 10, expirationDate: "2026-09-14" },
        ],
        4,
        "2026-09-13",
      ),
    ).toBe(8);
    expect(calculateProjectedExpiringLoss([{ quantity: 50, expirationDate: null }], 0, "2026-09-13")).toBe(0);
  });

  it("期限切れ在庫は販売可能在庫から除外し、廃棄リスクは critical", () => {
    const result = recommendOrder({
      ...base,
      quantityOnHand: 30,
      expiredQuantity: 10,
      usableLots: [{ quantity: 20, expirationDate: "2026-12-31" }],
    });
    expect(result.usableStock).toBe(20);
    expect(result.wasteRisk).toBe("critical");
    expect(result.reasons.map((r) => r.code)).toContain("expired_stock");
  });

  it("消化不能見込みは有効在庫から除外する", () => {
    const result = recommendOrder({
      ...base,
      usage7d: 14,
      usage30d: 60,
      quantityOnHand: 30,
      usableLots: [{ quantity: 30, expirationDate: "2026-09-17" }],
      leadTimeDays: 1,
      safetyStock: 0,
      reorderPoint: 0,
    });
    expect(result.projectedExpiringLoss).toBe(20);
    expect(result.effectiveStock).toBe(10);
    expect(result.wasteRisk).toBe("critical");
  });

  it("賞味期間内に消化できる量に上限を設ける", () => {
    const input: RecommendationInput = {
      ...base,
      quantityOnHand: 0,
      usableLots: [],
      leadTimeDays: 2,
      reviewPeriodDays: 3,
      shelfLifeDays: 5,
      safetyStock: 30,
      reorderPoint: 30,
      orderLotSize: 12,
    };
    const result = recommendOrder(input);
    expect(result.rawRecommendedQuantity).toBe(80);
    expect(result.shelfLifeCapQuantity).toBe(60);
    expect(result.recommendedQuantity).toBe(60);
    expect(result.reasons.map((r) => r.code)).toContain("shelf_life_cap");
  });

  it("切り上げると上限を超える場合は発注単位で切り下げる", () => {
    const result = recommendOrder({
      ...base,
      quantityOnHand: 0,
      usableLots: [],
      leadTimeDays: 2,
      reviewPeriodDays: 3,
      shelfLifeDays: 5,
      safetyStock: 30,
      reorderPoint: 30,
      orderLotSize: 25,
    });
    expect(result.recommendedQuantity).toBe(50);
  });

  it("切り下げで最小発注数量を満たせず、欠品が迫る場合は最小単位で発注する", () => {
    const result = recommendOrder({
      ...base,
      quantityOnHand: 0,
      usableLots: [],
      leadTimeDays: 2,
      reviewPeriodDays: 3,
      shelfLifeDays: 5,
      safetyStock: 30,
      reorderPoint: 30,
      orderLotSize: 100,
      minimumOrderQuantity: 100,
    });
    expect(result.recommendedQuantity).toBe(100);
  });

  it("在庫に余裕があり、期限内に消化できない単位しか発注できない場合は発注しない", () => {
    const result = recommendOrder({
      ...base,
      quantityOnHand: 40,
      usableLots: [{ quantity: 40, expirationDate: "2026-12-31" }],
      leadTimeDays: 2,
      reviewPeriodDays: 3,
      shelfLifeDays: 5,
      safetyStock: 30,
      reorderPoint: 50,
      orderLotSize: 100,
      minimumOrderQuantity: 100,
    });
    expect(result.rawRecommendedQuantity).toBe(40);
    expect(result.shelfLifeCapQuantity).toBe(20);
    expect(result.recommendedQuantity).toBe(0);
  });
});

describe("廃棄計算・廃棄傾向", () => {
  it("廃棄率 = 廃棄 ÷ (出庫 + 廃棄)", () => {
    expect(calculateWasteRate(60, 300)).toBeCloseTo(0.1667, 4);
    expect(calculateWasteRate(0, 0)).toBe(0);
    expect(calculateWasteRate(-5, 100)).toBe(0);
  });

  it("廃棄率が高い商品は推奨数を抑える（期間需要は割り込まない）", () => {
    const result = recommendOrder({ ...base, waste30d: 60 });
    expect(result.recommendedQuantity).toBe(17);
    expect(result.wasteRisk).toBe("high");
    expect(result.reasons.map((r) => r.code)).toContain("waste_trend_reduction");
  });

  it("classifyWasteRisk", () => {
    expect(classifyWasteRisk({ usableStock: 100, expiredQuantity: 0, projectedExpiringLoss: 0, wasteRate: 0, isOverstock: false })).toBe("low");
    expect(classifyWasteRisk({ usableStock: 100, expiredQuantity: 0, projectedExpiringLoss: 5, wasteRate: 0, isOverstock: false })).toBe("medium");
    expect(classifyWasteRisk({ usableStock: 100, expiredQuantity: 0, projectedExpiringLoss: 25, wasteRate: 0, isOverstock: false })).toBe("high");
    expect(classifyWasteRisk({ usableStock: 100, expiredQuantity: 1, projectedExpiringLoss: 0, wasteRate: 0, isOverstock: false })).toBe("critical");
  });
});

describe("平均出庫・曜日傾向・利用可能在庫", () => {
  it("利用可能在庫 = 現在庫 - 引当（負にしない）", () => {
    expect(calculateAvailableStock(10, 3)).toBe(7);
    expect(calculateAvailableStock(3, 10)).toBe(0);
    expect(calculateAvailableStock(Number.NaN, 0)).toBe(0);
  });

  it("7日平均と30日平均を加重する", () => {
    const result = calculateAverageDailyUsage({ usage7d: 140, usage30d: 300, today: "2026-09-13", firstReceivedDate: null });
    expect(result.average7d).toBe(20);
    expect(result.average30d).toBe(10);
    expect(result.weighted).toBe(16);
  });

  it("取扱開始から日が浅い商品は実日数で平均する", () => {
    const result = calculateAverageDailyUsage({ usage7d: 30, usage30d: 30, today: "2026-09-13", firstReceivedDate: "2026-09-10" });
    expect(result.average7d).toBe(10);
    expect(result.weighted).toBe(10);
  });

  it("曜日補正係数は 0.7〜1.4 に制限される", () => {
    const pattern = [0, 10, 10, 10, 10, 10, 30];
    expect(calculateWeekdayFactor(pattern, "2026-09-13", 1)).toBe(0.7); // 日曜
    expect(calculateWeekdayFactor(pattern, "2026-09-19", 1)).toBe(1.4); // 土曜
    expect(calculateWeekdayFactor(pattern, "2026-09-13", 7)).toBe(1);
    expect(calculateWeekdayFactor([0, 0, 0, 0, 0, 0, 0], "2026-09-13", 3)).toBe(1);
  });
});
