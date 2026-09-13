import { describe, expect, it } from "vitest";

import { explanationPreservesQuantity } from "@/lib/ai/guard";
import { toUserMessage } from "@/lib/errors";
import { formatCurrency, formatDate, formatDateTime, normalizeSearchQuery, todayJst } from "@/lib/format";

import { assignableRoles, hasPermission, isMemberRole, resolveActiveOrganization } from "./permissions";
import { buildTemplateExplanation } from "./reason-text";
import { recommendOrder } from "./recommendation";

describe("ロール権限", () => {
  it("ロールごとの操作可否", () => {
    expect(hasPermission("owner", "members.manage")).toBe(true);
    expect(hasPermission("admin", "locations.manage")).toBe(true);
    expect(hasPermission("inventory_manager", "purchase.manage")).toBe(true);
    expect(hasPermission("inventory_manager", "members.manage")).toBe(false);
    expect(hasPermission("staff", "inventory.issue")).toBe(true);
    expect(hasPermission("staff", "inventory.receive")).toBe(true);
    expect(hasPermission("staff", "inventory.waste")).toBe(false);
    expect(hasPermission("staff", "purchase.manage")).toBe(false);
    expect(hasPermission("viewer", "inventory.issue")).toBe(false);
    expect(hasPermission(null, "inventory.issue")).toBe(false);
  });

  it("管理者はオーナーを付与できない", () => {
    expect(assignableRoles("owner")).toContain("owner");
    expect(assignableRoles("admin")).not.toContain("owner");
    expect(assignableRoles("staff")).toEqual([]);
    expect(isMemberRole("inventory_manager")).toBe(true);
    expect(isMemberRole("superuser")).toBe(false);
  });
});

describe("組織分離ヘルパー", () => {
  const memberships = [
    { organizationId: "org-a", role: "owner" },
    { organizationId: "org-b", role: "viewer" },
  ];

  it("所属組織の ID のみ解決する", () => {
    expect(resolveActiveOrganization(memberships, "org-b")?.organizationId).toBe("org-b");
  });

  it("所属外の組織 ID は所属組織にフォールバックし、他組織を参照させない", () => {
    expect(resolveActiveOrganization(memberships, "org-x")?.organizationId).toBe("org-a");
    expect(resolveActiveOrganization(memberships, null)?.organizationId).toBe("org-a");
    expect(resolveActiveOrganization([], "org-a")).toBeNull();
  });
});

describe("エラーメッセージ", () => {
  it("業務エラーはそのまま、内部エラーは汎用メッセージ", () => {
    expect(toUserMessage({ code: "P0001", message: "在庫が不足しています。" })).toBe("在庫が不足しています。");
    expect(toUserMessage({ code: "P0001", message: "internal detail" })).not.toContain("internal");
    expect(toUserMessage({ code: "42501", message: "new row violates row-level security policy" })).toBe(
      "この操作を行う権限がありません。",
    );
    expect(toUserMessage({ code: "23505", message: 'duplicate key value violates unique constraint "products_organization_id_sku_key"' })).toBe(
      "このSKUはすでに登録されています。",
    );
  });
});

describe("AI 説明のガードとテンプレート", () => {
  it("推奨数量が改変されていないか検証する", () => {
    expect(explanationPreservesQuantity("48個の発注を推奨します。", 48)).toBe(true);
    expect(explanationPreservesQuantity("１，２００個の発注を推奨します。", 1200)).toBe(true);
    expect(explanationPreservesQuantity("50個の発注を推奨します。", 48)).toBe(false);
    expect(explanationPreservesQuantity("148個の発注を推奨します。", 48)).toBe(false);
    expect(explanationPreservesQuantity("48.5個", 48)).toBe(false);
  });

  it("テンプレート説明に推奨数量が含まれる", () => {
    const result = recommendOrder({
      today: "2026-09-13",
      quantityOnHand: 21,
      quantityReserved: 0,
      expiredQuantity: 0,
      quarantinedQuantity: 0,
      usableLots: [{ quantity: 21, expirationDate: null }],
      safetyStock: 12,
      reorderPoint: 36,
      minimumOrderQuantity: 12,
      orderLotSize: 12,
      unitsPerCase: 12,
      leadTimeDays: 3,
      shelfLifeDays: null,
      expirationWarningDays: 3,
      usage7d: 59,
      usage30d: 240,
      usageByWeekday: [32, 32, 32, 32, 32, 32, 32],
      firstReceivedDate: null,
      waste30d: 0,
      incomingQuantity: 0,
      reviewPeriodDays: 3,
      overstockDays: 45,
    });
    const text = buildTemplateExplanation(result, { productName: "テスト商品", unit: "個", leadTimeDays: 3, supplierName: "南州食品" });
    expect(result.recommendedQuantity).toBeGreaterThan(0);
    expect(result.recommendedQuantity % 12).toBe(0);
    expect(explanationPreservesQuantity(text, result.recommendedQuantity)).toBe(true);
    expect(text).toContain("発注単位12個");
  });
});

describe("日本向けフォーマット", () => {
  it("YYYY/MM/DD・Asia/Tokyo・円", () => {
    expect(formatDate("2026-09-13")).toBe("2026/09/13");
    expect(formatDate("2026-09-12T16:30:00Z")).toBe("2026/09/13");
    expect(formatDateTime("2026-09-12T16:30:00Z")).toBe("2026/09/13 01:30");
    expect(formatCurrency(12345)).toMatch(/12,345/);
    expect(formatDate(null)).toBe("—");
    expect(todayJst(new Date("2026-09-12T15:00:00Z"))).toBe("2026-09-13");
  });

  it("検索語の正規化（全角→半角、ひらがな→カタカナ）", () => {
    expect(normalizeSearchQuery("ＡＢＣ１２３")).toEqual({ primary: "ABC123", kana: null });
    expect(normalizeSearchQuery("てんねんすい")).toEqual({ primary: "てんねんすい", kana: "テンネンスイ" });
  });
});
