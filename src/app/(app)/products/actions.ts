"use server";

import { authorizeAction } from "@/lib/auth/context";
import { logDbError, toUserMessage } from "@/lib/errors";
import { isUuid, sanitizeFilterText } from "@/lib/search-params";
import { formDataToObject, validationFailure, type ActionResult } from "@/lib/validation/common";
import { productSchema, type ProductInput } from "@/lib/validation/schemas";

function toRow(input: ProductInput) {
  return {
    sku: input.sku,
    jan_code: input.jan_code ?? null,
    product_name: input.product_name,
    product_name_kana: input.product_name_kana ?? null,
    manufacturer: input.manufacturer ?? null,
    brand: input.brand ?? null,
    category_id: input.category_id ?? null,
    subcategory_id: input.subcategory_id ?? null,
    specification: input.specification ?? null,
    content_amount: input.content_amount ?? null,
    content_unit: input.content_unit ?? null,
    sales_unit: input.sales_unit,
    purchase_unit: input.purchase_unit,
    units_per_case: input.units_per_case,
    cost_price: input.cost_price,
    selling_price: input.selling_price,
    tax_rate: input.tax_rate,
    storage_type: input.storage_type,
    storage_temperature_min: input.storage_temperature_min ?? null,
    storage_temperature_max: input.storage_temperature_max ?? null,
    shelf_life_days: input.shelf_life_days ?? null,
    expiration_warning_days: input.expiration_warning_days,
    safety_stock: input.safety_stock,
    reorder_point: input.reorder_point,
    standard_order_quantity: input.standard_order_quantity,
    minimum_order_quantity: input.minimum_order_quantity,
    order_lot_size: input.order_lot_size,
    lead_time_days: input.lead_time_days,
    primary_supplier_id: input.primary_supplier_id ?? null,
    storage_location_note: input.storage_location_note ?? null,
    notes: input.notes ?? null,
    is_active: input.is_active,
  };
}

export async function createProductAction(_previous: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const auth = await authorizeAction("master.manage");
  if (!auth.ok) return auth;
  const parsed = productSchema.safeParse(formDataToObject(formData));
  if (!parsed.success) return validationFailure(parsed.error);

  const { data, error } = await auth.context.supabase
    .from("products")
    .insert({ ...toRow(parsed.data), organization_id: auth.context.organization.id })
    .select("id")
    .single();
  if (error) {
    logDbError("create product", error);
    return { ok: false, message: toUserMessage(error, "商品を登録できませんでした。") };
  }
  return { ok: true, message: `「${parsed.data.product_name}」を登録しました。`, redirectTo: `/products/${data.id}` };
}

export async function updateProductAction(productId: string, _previous: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const auth = await authorizeAction("master.manage");
  if (!auth.ok) return auth;
  if (!isUuid(productId)) return { ok: false, message: "商品の指定が正しくありません。" };
  const parsed = productSchema.safeParse(formDataToObject(formData));
  if (!parsed.success) return validationFailure(parsed.error);

  const { data, error } = await auth.context.supabase
    .from("products")
    .update(toRow(parsed.data))
    .eq("id", productId)
    .eq("organization_id", auth.context.organization.id)
    .select("id");
  if (error) {
    logDbError("update product", error);
    return { ok: false, message: toUserMessage(error, "商品を更新できませんでした。") };
  }
  if (data.length === 0) return { ok: false, message: "商品が見つからないか、更新する権限がありません。" };
  return { ok: true, message: "商品情報を更新しました。", redirectTo: `/products/${productId}` };
}

export type ProductOption = {
  id: string;
  sku: string;
  product_name: string;
  sales_unit: string;
  cost_price: number;
  order_lot_size: number;
  minimum_order_quantity: number;
  shelf_life_days: number | null;
  primary_supplier_id: string | null;
};

/** 入出庫・発注フォームの商品選択（大量 SKU のため全件は送らず、検索結果の上位のみ返す） */
export async function searchProductOptionsAction(query: string, supplierId?: string): Promise<ActionResult<ProductOption[]>> {
  const auth = await authorizeAction();
  if (!auth.ok) return auth;
  const text = sanitizeFilterText(query.normalize("NFKC")).slice(0, 50);
  let request = auth.context.supabase
    .from("products")
    .select("id, sku, product_name, sales_unit, cost_price, order_lot_size, minimum_order_quantity, shelf_life_days, primary_supplier_id")
    .eq("organization_id", auth.context.organization.id)
    .eq("is_active", true)
    .order("sku")
    .limit(20);
  if (text) {
    const kana = text.replace(/[ぁ-ゖ]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) + 0x60));
    request = request.or(`search_text.ilike.*${text.toLowerCase()}*,search_text.ilike.*${kana.toLowerCase()}*`);
  }
  if (supplierId && isUuid(supplierId)) request = request.eq("primary_supplier_id", supplierId);
  const { data, error } = await request;
  if (error) {
    logDbError("search product options", error);
    return { ok: false, message: "商品の検索に失敗しました。" };
  }
  return { ok: true, message: "", data };
}
