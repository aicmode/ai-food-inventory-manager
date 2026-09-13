import { describe, expect, it } from "vitest";

import {
  allocateFefo,
  calculatePurchaseOrderTotals,
  canTransitionPurchaseOrder,
  classifyStockStatus,
  deriveLotStatus,
  groupBySupplier,
  statusAfterReceipt,
  summarizeWaste,
  type FefoLot,
} from "./inventory";

const today = "2026-09-13";

const lots: FefoLot[] = [
  { id: "A", quantityRemaining: 5, expirationDate: "2026-09-20", receivedDate: "2026-09-01", status: "available" },
  { id: "B", quantityRemaining: 3, expirationDate: "2026-09-15", receivedDate: "2026-09-05", status: "available" },
  { id: "C", quantityRemaining: 10, expirationDate: null, receivedDate: "2026-08-01", status: "available" },
  { id: "D", quantityRemaining: 100, expirationDate: "2026-09-12", receivedDate: "2026-08-01", status: "available" },
  { id: "E", quantityRemaining: 50, expirationDate: "2026-09-14", receivedDate: "2026-09-01", status: "quarantined" },
];

describe("FEFO 割当", () => {
  it("賞味期限の早いロットから割り当て、複数ロットを跨ぐ", () => {
    const result = allocateFefo(lots, 10, today);
    expect(result).toEqual({
      ok: true,
      allocations: [
        { lotId: "B", quantity: 3 },
        { lotId: "A", quantity: 5 },
        { lotId: "C", quantity: 2 },
      ],
    });
  });

  it("期限切れ・隔離ロットは出庫対象外で、不足時は失敗する（負の在庫を作らない）", () => {
    const result = allocateFefo(lots, 20, today);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.shortage).toBe(2);
  });

  it("同じ期限なら入庫日の早いロットを優先", () => {
    const result = allocateFefo(
      [
        ...lots,
        { id: "F", quantityRemaining: 4, expirationDate: "2026-09-15", receivedDate: "2026-09-02", status: "available" },
      ],
      5,
      today,
    );
    expect(result.ok && result.allocations).toEqual([
      { lotId: "F", quantity: 4 },
      { lotId: "B", quantity: 1 },
    ]);
  });

  it("賞味期限当日のロットは出庫できる", () => {
    const result = allocateFefo(
      [{ id: "G", quantityRemaining: 2, expirationDate: today, receivedDate: "2026-09-01", status: "available" }],
      2,
      today,
    );
    expect(result.ok).toBe(true);
  });

  it("数量が0以下・NaNは例外", () => {
    expect(() => allocateFefo(lots, 0, today)).toThrow(RangeError);
    expect(() => allocateFefo(lots, Number.NaN, today)).toThrow(RangeError);
  });
});

describe("ロット状態", () => {
  it("日付から expiring_soon / expired を導出", () => {
    const common = { today, warningDays: 3 };
    expect(deriveLotStatus({ ...common, status: "available", quantityRemaining: 5, expirationDate: "2026-09-12" })).toBe("expired");
    expect(deriveLotStatus({ ...common, status: "available", quantityRemaining: 5, expirationDate: "2026-09-16" })).toBe("expiring_soon");
    expect(deriveLotStatus({ ...common, status: "available", quantityRemaining: 5, expirationDate: "2026-09-17" })).toBe("available");
    expect(deriveLotStatus({ ...common, status: "available", quantityRemaining: 0, expirationDate: "2026-09-12" })).toBe("depleted");
    expect(deriveLotStatus({ ...common, status: "quarantined", quantityRemaining: 5, expirationDate: "2026-09-12" })).toBe("quarantined");
    expect(deriveLotStatus({ ...common, status: "available", quantityRemaining: 5, expirationDate: null })).toBe("available");
  });
});

describe("在庫状態", () => {
  const common = { reorderPoint: 20, safetyStock: 10, averageDailyUsage: 2, overstockDays: 45 };
  it("欠品・発注点以下・適正・過剰", () => {
    expect(classifyStockStatus({ ...common, available: 0 })).toBe("out_of_stock");
    expect(classifyStockStatus({ ...common, available: 20 })).toBe("low");
    expect(classifyStockStatus({ ...common, available: 50 })).toBe("normal");
    expect(classifyStockStatus({ ...common, available: 91 })).toBe("overstock");
    expect(classifyStockStatus({ ...common, available: 500, averageDailyUsage: 0 })).toBe("normal");
  });
});

describe("廃棄集計", () => {
  it("廃棄金額（ロット単価×数量）と廃棄率", () => {
    const summary = summarizeWaste(
      [
        { quantity: 3, unitCost: 120 },
        { quantity: 2, unitCost: 99.5 },
        { quantity: -1, unitCost: 100 },
        { quantity: Number.NaN, unitCost: 100 },
      ],
      95,
    );
    expect(summary).toEqual({ quantity: 5, amount: 559, rate: 0.05 });
    expect(summarizeWaste([], 0).rate).toBe(0);
  });
});

describe("発注金額・状態遷移・仕入先分割", () => {
  it("税率ごとに合計して消費税を切り捨て", () => {
    const totals = calculatePurchaseOrderTotals([
      { quantity: 10, unitCost: 100, taxRate: 8 },
      { quantity: 3, unitCost: 333.33, taxRate: 8 },
      { quantity: 5, unitCost: 200, taxRate: 10 },
    ]);
    expect(totals).toEqual({ subtotal: 2999.99, taxAmount: 259, totalAmount: 3258.99 });
  });

  it("許可された状態遷移のみ", () => {
    expect(canTransitionPurchaseOrder("draft", "ordered", false)).toBe(true);
    expect(canTransitionPurchaseOrder("draft", "cancelled", false)).toBe(true);
    expect(canTransitionPurchaseOrder("ordered", "cancelled", false)).toBe(true);
    expect(canTransitionPurchaseOrder("ordered", "cancelled", true)).toBe(false);
    expect(canTransitionPurchaseOrder("received", "cancelled", false)).toBe(false);
    expect(canTransitionPurchaseOrder("ordered", "draft", false)).toBe(false);
    expect(canTransitionPurchaseOrder("cancelled", "ordered", false)).toBe(false);
  });

  it("入荷状況から発注状態を決める", () => {
    expect(statusAfterReceipt([{ orderedQuantity: 10, receivedQuantity: 10 }])).toBe("received");
    expect(
      statusAfterReceipt([
        { orderedQuantity: 10, receivedQuantity: 10 },
        { orderedQuantity: 5, receivedQuantity: 0 },
      ]),
    ).toBe("partially_received");
    expect(statusAfterReceipt([{ orderedQuantity: 10, receivedQuantity: 0 }])).toBe("ordered");
  });

  it("仕入先ごとに分割し、仕入先未設定を分離", () => {
    const { groups, missingSupplier } = groupBySupplier([
      { sku: "A", supplierId: "s1" },
      { sku: "B", supplierId: "s2" },
      { sku: "C", supplierId: "s1" },
      { sku: "D", supplierId: null },
    ]);
    expect(groups.get("s1")?.map((i) => i.sku)).toEqual(["A", "C"]);
    expect(groups.get("s2")?.map((i) => i.sku)).toEqual(["B"]);
    expect(missingSupplier.map((i) => i.sku)).toEqual(["D"]);
  });
});
