import { describe, expect, it } from "vitest";

import { calculateJanCheckDigit, isValidJanCode, toFieldErrors } from "./common";
import { issueSchema, productSchema, purchaseOrderSchema, receiptSchema, supplierSchema, wasteSchema } from "./schemas";

const today = "2026-09-13";
const P1 = "3f1c2b8e-8d2a-4c1e-9b7a-1a2b3c4d5e6f";
const P2 = "7a9e4c21-5b3d-4f8a-a1c2-9d8e7f6a5b4c";
const L1 = "0b6a2d4e-1c3f-4a5b-8c7d-6e5f4a3b2c1d";
const L2 = "c2d4e6f8-a1b3-4c5d-9e7f-1a3b5c7d9e0f";

const validProduct = {
  sku: "DRK-WAT-0001",
  jan_code: "4006381333931",
  product_name: "やまなみ天然水 2L",
  product_name_kana: "ヤマナミテンネンスイ",
  manufacturer: "",
  brand: "",
  category_id: "",
  subcategory_id: "",
  specification: "2L ペットボトル",
  content_amount: "2",
  content_unit: "L",
  sales_unit: "本",
  purchase_unit: "ケース",
  units_per_case: "6",
  cost_price: "62",
  selling_price: "98",
  tax_rate: "8",
  storage_type: "room_temperature",
  storage_temperature_min: "",
  storage_temperature_max: "",
  shelf_life_days: "730",
  expiration_warning_days: "30",
  safety_stock: "12",
  reorder_point: "24",
  standard_order_quantity: "36",
  minimum_order_quantity: "6",
  order_lot_size: "6",
  lead_time_days: "2",
  primary_supplier_id: "",
  storage_location_note: "",
  notes: "",
  is_active: "on",
};

describe("JAN コード", () => {
  it("チェックデジットを検証する", () => {
    expect(isValidJanCode("4006381333931")).toBe(true);
    expect(isValidJanCode("4006381333932")).toBe(false);
    expect(isValidJanCode("73513537")).toBe(true);
    expect(isValidJanCode("123")).toBe(false);
    expect(isValidJanCode("40063813339a1")).toBe(false);
    expect(calculateJanCheckDigit("400638133393")).toBe(1);
  });
});

describe("商品バリデーション", () => {
  it("正しい入力を数値・真偽値に変換する", () => {
    const result = productSchema.safeParse(validProduct);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.units_per_case).toBe(6);
      expect(result.data.cost_price).toBe(62);
      expect(result.data.is_active).toBe(true);
      expect(result.data.manufacturer).toBeUndefined();
      expect(result.data.storage_temperature_min).toBeUndefined();
    }
  });

  it("負の数量・価格を拒否する", () => {
    const result = productSchema.safeParse({ ...validProduct, safety_stock: "-1", cost_price: "-10" });
    expect(result.success).toBe(false);
    if (!result.success) {
      const errors = toFieldErrors(result.error);
      expect(errors.safety_stock).toBeDefined();
      expect(errors.cost_price).toBeDefined();
    }
  });

  it("NaN（数値でない入力）を拒否する", () => {
    const result = productSchema.safeParse({ ...validProduct, order_lot_size: "abc" });
    expect(result.success).toBe(false);
    if (!result.success) expect(toFieldErrors(result.error).order_lot_size?.[0]).toContain("数値");
  });

  it("SKU 形式・JAN チェックデジットを検証する", () => {
    expect(productSchema.safeParse({ ...validProduct, sku: "ab" }).success).toBe(false);
    expect(productSchema.safeParse({ ...validProduct, sku: "SKU 001" }).success).toBe(false);
    expect(productSchema.safeParse({ ...validProduct, jan_code: "4006381333932" }).success).toBe(false);
    expect(productSchema.safeParse({ ...validProduct, jan_code: "" }).success).toBe(true);
  });

  it("業務ルール（発注点≥安全在庫・温度範囲・標準発注数は発注単位の倍数）", () => {
    const result = productSchema.safeParse({
      ...validProduct,
      reorder_point: "5",
      storage_temperature_min: "10",
      storage_temperature_max: "2",
      standard_order_quantity: "10",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const errors = toFieldErrors(result.error);
      expect(errors.reorder_point).toBeDefined();
      expect(errors.storage_temperature_max).toBeDefined();
      expect(errors.standard_order_quantity).toBeDefined();
    }
  });

  it("発注単位 0 は不可", () => {
    expect(productSchema.safeParse({ ...validProduct, order_lot_size: "0" }).success).toBe(false);
  });
});

describe("仕入先バリデーション", () => {
  it("メール・郵便番号の形式", () => {
    const base = {
      code: "SUP-001",
      company_name: "南州青果",
      minimum_order_amount: "0",
      standard_lead_time_days: "2",
      is_active: "on",
    };
    expect(supplierSchema.safeParse(base).success).toBe(true);
    expect(supplierSchema.safeParse({ ...base, email: "invalid" }).success).toBe(false);
    expect(supplierSchema.safeParse({ ...base, postal_code: "8900053" }).success).toBe(true);
    expect(supplierSchema.safeParse({ ...base, postal_code: "89-0053" }).success).toBe(false);
  });
});

describe("入庫バリデーション", () => {
  const schema = receiptSchema(today);
  const base = {
    location_id: L1,
    received_date: today,
    items: [{ product_id: P1, quantity: "12", manufacture_date: "2026-09-01", expiration_date: "2026-10-01" }],
  };

  it("正しい入力", () => {
    expect(schema.safeParse(base).success).toBe(true);
  });

  it("賞味期限が製造日より前は不可", () => {
    const result = schema.safeParse({
      ...base,
      items: [{ product_id: P1, quantity: "12", manufacture_date: "2026-09-10", expiration_date: "2026-09-01" }],
    });
    expect(result.success).toBe(false);
    if (!result.success) expect(toFieldErrors(result.error)["items.0.expiration_date"]).toBeDefined();
  });

  it("未来の入庫日・0個・存在しない日付は不可", () => {
    expect(schema.safeParse({ ...base, received_date: "2026-09-14" }).success).toBe(false);
    expect(schema.safeParse({ ...base, items: [{ product_id: P1, quantity: "0" }] }).success).toBe(false);
    expect(
      schema.safeParse({ ...base, items: [{ product_id: P1, quantity: "1", expiration_date: "2026-02-30" }] }).success,
    ).toBe(false);
  });
});

describe("出庫バリデーション", () => {
  it("拠点間移動は移動先が必須で、出庫元と異なること", () => {
    const base = { location_id: L1, issue_type: "transfer", items: [{ product_id: P1, quantity: "3" }] };
    expect(issueSchema.safeParse(base).success).toBe(false);
    expect(issueSchema.safeParse({ ...base, destination_location_id: L1 }).success).toBe(false);
    expect(issueSchema.safeParse({ ...base, destination_location_id: L2 }).success).toBe(true);
    expect(issueSchema.safeParse({ ...base, issue_type: "sale" }).success).toBe(true);
  });

  it("負の数量は不可", () => {
    expect(
      issueSchema.safeParse({ location_id: L1, issue_type: "sale", items: [{ product_id: P1, quantity: "-2" }] }).success,
    ).toBe(false);
  });
});

describe("廃棄バリデーション", () => {
  it("数量・理由・日付", () => {
    const schema = wasteSchema(today);
    const base = { location_id: L1, product_id: P1, quantity: "2", reason: "expired", waste_date: today };
    expect(schema.safeParse(base).success).toBe(true);
    expect(schema.safeParse({ ...base, quantity: "0" }).success).toBe(false);
    expect(schema.safeParse({ ...base, reason: "lost" }).success).toBe(false);
    expect(schema.safeParse({ ...base, waste_date: "2026-09-20" }).success).toBe(false);
  });
});

describe("発注バリデーション", () => {
  it("同じ商品の重複行は不可", () => {
    const schema = purchaseOrderSchema(today);
    const base = { supplier_id: L1, location_id: L2, items: [{ product_id: P1, ordered_quantity: "12" }] };
    expect(schema.safeParse(base).success).toBe(true);
    expect(
      schema.safeParse({
        ...base,
        items: [
          { product_id: P1, ordered_quantity: "12" },
          { product_id: P1, ordered_quantity: "6" },
        ],
      }).success,
    ).toBe(false);
    expect(schema.safeParse({ ...base, items: [{ product_id: P2, ordered_quantity: "12" }], expected_delivery_date: "2026-09-01" }).success).toBe(false);
  });
});
