import { z } from "zod";
import {
  CODE_PATTERN,
  PHONE_PATTERN,
  POSTAL_CODE_PATTERN,
  SKU_PATTERN,
  checkbox,
  dateString,
  isValidJanCode,
  optionalDateString,
  optionalNumber,
  optionalPrice,
  optionalText,
  optionalUuid,
  price,
  quantity,
  requiredNumber,
  requiredText,
  uuid,
} from "./common";

export const STORAGE_TYPES = ["room_temperature", "refrigerated", "frozen"] as const;
export const LOCATION_TYPES = ["store", "warehouse"] as const;
export const ISSUE_TYPES = ["sale", "usage", "transfer"] as const;
export const WASTE_REASONS = ["expired", "damaged", "quality_issue", "overstock", "other"] as const;
export const TAX_RATES = [0, 8, 10] as const;

const optionalPattern = (label: string, max: number, pattern: RegExp, message: string) =>
  optionalText(label, max).refine((value) => value === undefined || pattern.test(value), message);

// -----------------------------------------------------------------------------
// 商品
// -----------------------------------------------------------------------------
export const productSchema = z
  .object({
    sku: requiredText("SKU", 40).refine(
      (value) => SKU_PATTERN.test(value),
      "SKUは英数字・ハイフン・アンダースコアの3〜40文字で入力してください（先頭は英数字）。",
    ),
    jan_code: optionalText("JANコード", 13).refine(
      (value) => value === undefined || isValidJanCode(value),
      "JANコードは8桁または13桁の数字で、チェックデジットが正しい必要があります。",
    ),
    product_name: requiredText("商品名", 200),
    product_name_kana: optionalText("商品名カナ", 200),
    manufacturer: optionalText("メーカー", 100),
    brand: optionalText("ブランド", 100),
    category_id: optionalUuid("カテゴリ"),
    subcategory_id: optionalUuid("小分類"),
    specification: optionalText("規格", 200),
    content_amount: optionalNumber("内容量", { positive: true, max: 999_999 }),
    content_unit: optionalText("内容量単位", 20),
    sales_unit: requiredText("販売単位", 20),
    purchase_unit: requiredText("仕入単位", 20),
    units_per_case: requiredNumber("ケース入数", { int: true, min: 1, max: 10_000 }),
    cost_price: price("原価"),
    selling_price: price("売価"),
    tax_rate: requiredNumber("税率").refine(
      (value) => (TAX_RATES as readonly number[]).includes(value),
      "税率は0%・8%・10%から選択してください。",
    ),
    storage_type: z.enum(STORAGE_TYPES, { error: "保存区分を選択してください。" }),
    storage_temperature_min: optionalNumber("保存温度（下限）", { min: -60, max: 60 }),
    storage_temperature_max: optionalNumber("保存温度（上限）", { min: -60, max: 60 }),
    shelf_life_days: optionalNumber("賞味期間", { int: true, min: 1, max: 3650 }),
    expiration_warning_days: requiredNumber("期限アラート日数", { int: true, min: 0, max: 365 }),
    safety_stock: quantity("安全在庫"),
    reorder_point: quantity("発注点"),
    standard_order_quantity: quantity("標準発注数"),
    minimum_order_quantity: quantity("最小発注数量"),
    order_lot_size: quantity("発注単位", { positive: true }),
    lead_time_days: requiredNumber("リードタイム", { int: true, min: 0, max: 180 }),
    primary_supplier_id: optionalUuid("主要仕入先"),
    storage_location_note: optionalText("保管場所メモ", 200),
    notes: optionalText("備考", 2000),
    is_active: checkbox(),
  })
  .superRefine((value, ctx) => {
    if (value.subcategory_id && !value.category_id) {
      ctx.addIssue({ code: "custom", path: ["category_id"], message: "小分類を選ぶ場合はカテゴリも選択してください。" });
    }
    if (
      value.storage_temperature_min !== undefined &&
      value.storage_temperature_max !== undefined &&
      value.storage_temperature_min > value.storage_temperature_max
    ) {
      ctx.addIssue({
        code: "custom",
        path: ["storage_temperature_max"],
        message: "保存温度の上限は下限以上にしてください。",
      });
    }
    if (value.reorder_point < value.safety_stock) {
      ctx.addIssue({ code: "custom", path: ["reorder_point"], message: "発注点は安全在庫以上に設定してください。" });
    }
    if (value.standard_order_quantity > 0) {
      const ratio = value.standard_order_quantity / value.order_lot_size;
      if (Math.abs(ratio - Math.round(ratio)) > 1e-6) {
        ctx.addIssue({
          code: "custom",
          path: ["standard_order_quantity"],
          message: "標準発注数は発注単位の倍数で設定してください。",
        });
      }
    }
  });

export type ProductInput = z.infer<typeof productSchema>;

// -----------------------------------------------------------------------------
// 仕入先
// -----------------------------------------------------------------------------
export const supplierSchema = z.object({
  code: requiredText("仕入先コード", 20).refine(
    (value) => CODE_PATTERN.test(value),
    "仕入先コードは英数字・ハイフン・アンダースコアの20文字以内で入力してください。",
  ),
  company_name: requiredText("会社名", 120),
  contact_name: optionalText("担当者名", 60),
  email: optionalText("メールアドレス", 254).refine(
    (value) => value === undefined || z.email().safeParse(value).success,
    "メールアドレスの形式が正しくありません。",
  ),
  phone: optionalPattern("電話番号", 20, PHONE_PATTERN, "電話番号は数字とハイフンで入力してください。"),
  postal_code: optionalPattern("郵便番号", 8, POSTAL_CODE_PATTERN, "郵便番号は123-4567の形式で入力してください。"),
  prefecture: optionalText("都道府県", 10),
  city: optionalText("市区町村", 100),
  address: optionalText("住所", 200),
  payment_terms: optionalText("支払条件", 100),
  minimum_order_amount: price("最低発注金額"),
  standard_lead_time_days: requiredNumber("標準リードタイム", { int: true, min: 0, max: 180 }),
  notes: optionalText("備考", 2000),
  is_active: checkbox(),
});

export type SupplierInput = z.infer<typeof supplierSchema>;

// -----------------------------------------------------------------------------
// 拠点
// -----------------------------------------------------------------------------
export const locationSchema = z.object({
  code: requiredText("拠点コード", 20).refine(
    (value) => CODE_PATTERN.test(value),
    "拠点コードは英数字・ハイフン・アンダースコアの20文字以内で入力してください。",
  ),
  name: requiredText("拠点名", 100),
  type: z.enum(LOCATION_TYPES, { error: "拠点種別を選択してください。" }),
  postal_code: optionalPattern("郵便番号", 8, POSTAL_CODE_PATTERN, "郵便番号は123-4567の形式で入力してください。"),
  prefecture: optionalText("都道府県", 10),
  city: optionalText("市区町村", 100),
  address: optionalText("住所", 200),
  phone: optionalPattern("電話番号", 20, PHONE_PATTERN, "電話番号は数字とハイフンで入力してください。"),
  is_active: checkbox(),
});

export type LocationInput = z.infer<typeof locationSchema>;

// -----------------------------------------------------------------------------
// カテゴリ・組織
// -----------------------------------------------------------------------------
export const categorySchema = z.object({
  name: requiredText("カテゴリ名", 60),
  code: requiredText("カテゴリコード", 40).refine(
    (value) => /^[A-Za-z0-9_-]{1,40}$/.test(value),
    "カテゴリコードは英数字・ハイフン・アンダースコアで入力してください。",
  ),
  parent_id: optionalUuid("親カテゴリ"),
  sort_order: requiredNumber("表示順", { int: true, min: 0, max: 100_000 }),
});

export const organizationSettingsSchema = z.object({
  name: requiredText("組織名", 100),
  review_period_days: requiredNumber("発注サイクル", { int: true, min: 0, max: 60 }),
  overstock_days: requiredNumber("過剰在庫の目安", { int: true, min: 7, max: 365 }),
});

// -----------------------------------------------------------------------------
// 入庫
// -----------------------------------------------------------------------------
export const receiptItemSchema = z
  .object({
    product_id: uuid("商品"),
    quantity: quantity("入庫数", { positive: true }),
    lot_number: optionalText("ロット番号", 60),
    manufacture_date: optionalDateString("製造日"),
    expiration_date: optionalDateString("賞味期限"),
    unit_cost: optionalPrice("単価"),
  })
  .superRefine((value, ctx) => {
    if (value.manufacture_date && value.expiration_date && value.expiration_date < value.manufacture_date) {
      ctx.addIssue({ code: "custom", path: ["expiration_date"], message: "賞味期限は製造日以降の日付にしてください。" });
    }
  });

export function receiptSchema(today: string) {
  return z
    .object({
      location_id: uuid("入庫先"),
      supplier_id: optionalUuid("仕入先"),
      purchase_order_id: optionalUuid("発注書"),
      received_date: dateString("入庫日").refine((value) => value <= today, "入庫日に未来の日付は指定できません。"),
      notes: optionalText("備考", 2000),
      items: z
        .array(receiptItemSchema, { error: "入庫明細を追加してください。" })
        .min(1, "入庫明細を1件以上追加してください。")
        .max(200, "入庫明細は200件までです。"),
    })
    .superRefine((value, ctx) => {
      value.items.forEach((item, index) => {
        if (item.manufacture_date && item.manufacture_date > value.received_date) {
          ctx.addIssue({
            code: "custom",
            path: ["items", index, "manufacture_date"],
            message: `明細${index + 1}: 製造日が入庫日より後になっています。`,
          });
        }
      });
    });
}

// -----------------------------------------------------------------------------
// 出庫・移動
// -----------------------------------------------------------------------------
export const issueSchema = z
  .object({
    location_id: uuid("出庫元"),
    issue_type: z.enum(ISSUE_TYPES, { error: "出庫区分を選択してください。" }),
    destination_location_id: optionalUuid("移動先"),
    notes: optionalText("備考", 2000),
    items: z
      .array(
        z.object({
          product_id: uuid("商品"),
          quantity: quantity("出庫数", { positive: true }),
          lot_id: optionalUuid("ロット"),
        }),
        { error: "出庫明細を追加してください。" },
      )
      .min(1, "出庫明細を1件以上追加してください。")
      .max(200, "出庫明細は200件までです。"),
  })
  .superRefine((value, ctx) => {
    if (value.issue_type === "transfer") {
      if (!value.destination_location_id) {
        ctx.addIssue({ code: "custom", path: ["destination_location_id"], message: "移動先の拠点を選択してください。" });
      } else if (value.destination_location_id === value.location_id) {
        ctx.addIssue({
          code: "custom",
          path: ["destination_location_id"],
          message: "移動先には出庫元と異なる拠点を選択してください。",
        });
      }
    } else if (value.destination_location_id) {
      ctx.addIssue({
        code: "custom",
        path: ["destination_location_id"],
        message: "移動先は拠点間移動の場合のみ指定できます。",
      });
    }
  });

// -----------------------------------------------------------------------------
// 廃棄
// -----------------------------------------------------------------------------
export function wasteSchema(today: string) {
  return z.object({
    location_id: uuid("拠点"),
    product_id: uuid("商品"),
    lot_id: optionalUuid("ロット"),
    quantity: quantity("廃棄数", { positive: true }),
    reason: z.enum(WASTE_REASONS, { error: "廃棄理由を選択してください。" }),
    waste_date: dateString("廃棄日").refine((value) => value <= today, "廃棄日に未来の日付は指定できません。"),
    notes: optionalText("備考", 500),
  });
}

// -----------------------------------------------------------------------------
// 棚卸
// -----------------------------------------------------------------------------
export const stocktakeCreateSchema = z.object({
  location_id: uuid("拠点"),
  category_id: optionalUuid("カテゴリ"),
  notes: optionalText("備考", 2000),
});

export const stocktakeCountsSchema = z.object({
  items: z
    .array(
      z.object({
        item_id: uuid("棚卸明細"),
        actual_quantity: optionalNumber("実数", { min: 0, max: 99_999_999 }),
        reason: optionalText("差異理由", 500),
      }),
    )
    .min(1, "保存する明細がありません。")
    .max(500, "一度に保存できる明細は500件までです。"),
});

// -----------------------------------------------------------------------------
// 発注
// -----------------------------------------------------------------------------
const orderItemSchema = z.object({
  product_id: uuid("商品"),
  ordered_quantity: quantity("発注数", { positive: true }),
  unit_cost: optionalPrice("単価"),
});

function noDuplicateProducts(items: { product_id: string }[], ctx: z.RefinementCtx) {
  const seen = new Set<string>();
  items.forEach((item, index) => {
    if (seen.has(item.product_id)) {
      ctx.addIssue({
        code: "custom",
        path: ["items", index, "product_id"],
        message: "同じ商品が複数行に含まれています。1商品1行にまとめてください。",
      });
    }
    seen.add(item.product_id);
  });
}

export function purchaseOrderSchema(today: string) {
  return z
    .object({
      supplier_id: uuid("仕入先"),
      location_id: uuid("納品先"),
      expected_delivery_date: optionalDateString("納品予定日").refine(
        (value) => value === undefined || value >= today,
        "納品予定日に過去の日付は指定できません。",
      ),
      notes: optionalText("備考", 2000),
      submit: checkbox(),
      items: z
        .array(orderItemSchema, { error: "発注明細を追加してください。" })
        .min(1, "発注明細を1件以上追加してください。")
        .max(300, "発注明細は300件までです。"),
    })
    .superRefine((value, ctx) => noDuplicateProducts(value.items, ctx));
}

export const purchaseOrderDraftUpdateSchema = z.object({
  expected_delivery_date: optionalDateString("納品予定日"),
  notes: optionalText("備考", 2000),
  items: z
    .array(z.object({ item_id: uuid("発注明細"), ordered_quantity: quantity("発注数") }))
    .max(300, "発注明細は300件までです。"),
});

export const recommendationOrderSchema = z
  .object({
    location_id: uuid("拠点"),
    items: z
      .array(
        z.object({
          product_id: uuid("商品"),
          ordered_quantity: quantity("発注数", { positive: true }),
          ai_recommended_quantity: quantity("推奨数"),
          ai_reason: optionalText("推奨理由", 2000),
        }),
      )
      .min(1, "発注する商品を選択してください。")
      .max(1000, "一度に発注できる商品は1000件までです。"),
  })
  .superRefine((value, ctx) => noDuplicateProducts(value.items, ctx));
