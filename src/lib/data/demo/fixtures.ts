import "server-only";

import { generateProducts, generateSuppliers, CATEGORY_TREE, SEED_LOCATIONS } from "../../../../scripts/seed/catalog";
import { Rng } from "../../../../scripts/seed/random";

export const DEMO_SEED = 20260913;
export const DEMO_ORGANIZATION_ID = "10000000-0000-4000-8000-000000000001";
export const DEMO_ORGANIZATION_NAME = "フレッシュマート ONE";
export const DEMO_OPERATOR_ID = "10000000-0000-4000-8000-000000000002";

type Row = Record<string, unknown>;

export type DemoDataset = {
  locations: Row[];
  categories: Row[];
  suppliers: Row[];
  products: Row[];
  product_suppliers: Row[];
  inventory_balances: Row[];
  inventory_lots: Row[];
  inventory_transactions: Row[];
  purchase_orders: Row[];
  purchase_order_items: Row[];
  receipts: Row[];
  stock_issues: Row[];
  stocktakes: Row[];
  stocktake_items: Row[];
  waste_records: Row[];
};

const pad = (value: number, length = 2) => String(value).padStart(length, "0");
const isoDate = (date: Date) => date.toISOString().slice(0, 10);
const isoTime = (date: Date) => date.toISOString();
const addDays = (date: Date, days: number) => new Date(date.getTime() + days * 86_400_000);
const addMonths = (date: Date, months: number) => {
  const next = new Date(date);
  next.setUTCMonth(next.getUTCMonth() + months);
  return next;
};

/** 日本時間の「今日」12:00（UTC 03:00）。日付計算をタイムゾーンに依存させない。 */
function demoNow(): Date {
  const jst = new Date(Date.now() + 9 * 3_600_000);
  return new Date(Date.UTC(jst.getUTCFullYear(), jst.getUTCMonth(), jst.getUTCDate(), 3, 0, 0));
}

function topCategoryId(topCode: string, categories: Row[]): string {
  return String(categories.find((category) => category.code === topCode)?.id ?? "");
}

function subCategoryId(subCode: string, categories: Row[]): string {
  return String(categories.find((category) => category.code === subCode)?.id ?? "");
}

let memoized: { day: string; dataset: DemoDataset } | undefined;

/**
 * 約3万行を日本時間の1日につき1回だけ生成し、一覧には必要ページだけ返す。
 * 読み取り専用の固定データなので、全閲覧者で共有しても利用者固有の情報は混ざらない。
 */
export function getDemoDataset(): DemoDataset {
  const now = demoNow();
  const day = isoDate(now);
  if (memoized?.day === day) return memoized.dataset;

  const rng = new Rng(DEMO_SEED);
  const generatedProducts = generateProducts(rng, 1000);
  const generatedSuppliers = generateSuppliers(rng, 40);

  const locations: Row[] = SEED_LOCATIONS.map((location, index) => ({
    id: rng.uuid(),
    organization_id: DEMO_ORGANIZATION_ID,
    code: location.code,
    name: location.name,
    type: location.type,
    postal_code: location.postalCode,
    prefecture: location.prefecture,
    city: location.city,
    address: location.address,
    phone: location.phone,
    is_active: true,
    demand_factor: location.demandFactor,
    created_at: isoTime(addDays(now, -365 - index)),
    updated_at: isoTime(addDays(now, -index)),
  }));

  const categories: Row[] = [];
  for (const [topIndex, top] of CATEGORY_TREE.entries()) {
    const parentId = rng.uuid();
    categories.push({
      id: parentId,
      organization_id: DEMO_ORGANIZATION_ID,
      parent_id: null,
      code: top.code,
      name: top.name,
      sort_order: topIndex * 100,
      created_at: isoTime(addDays(now, -365)),
      updated_at: isoTime(addDays(now, -30)),
    });
    top.subs.forEach((name, subIndex) => {
      categories.push({
        id: rng.uuid(),
        organization_id: DEMO_ORGANIZATION_ID,
        parent_id: parentId,
        code: `${top.code}-${pad(subIndex + 1)}`,
        name,
        sort_order: topIndex * 100 + subIndex + 1,
        created_at: isoTime(addDays(now, -365)),
        updated_at: isoTime(addDays(now, -30)),
      });
    });
  }

  const suppliers: Row[] = generatedSuppliers.map((supplier, index) => ({
    id: supplier.id,
    organization_id: DEMO_ORGANIZATION_ID,
    code: supplier.code,
    company_name: supplier.companyName,
    contact_name: supplier.contactName,
    email: supplier.email,
    phone: supplier.phone,
    postal_code: supplier.postalCode,
    prefecture: supplier.prefecture,
    city: supplier.city,
    address: supplier.address,
    payment_terms: supplier.paymentTerms,
    minimum_order_amount: supplier.minimumOrderAmount,
    standard_lead_time_days: supplier.leadTimeDays,
    notes: "全国配送対応（販売デモ用の架空仕入先）",
    is_active: index % 19 !== 0,
    categories: supplier.categories,
    created_at: isoTime(addDays(now, -320 + index)),
    updated_at: isoTime(addDays(now, -(index % 30))),
  }));

  const productSuppliers: Row[] = [];
  const products: Row[] = generatedProducts.map((product, index) => {
    const candidates = suppliers.filter((supplier) => (supplier.categories as string[]).includes(product.topCode));
    const primary = candidates[index % Math.max(1, candidates.length)] ?? suppliers[index % suppliers.length];
    const safetyStock = Math.max(2, Math.round(product.referenceDemand * 3));
    const reorderPoint = Math.max(safetyStock, Math.round(product.referenceDemand * (Number(primary.standard_lead_time_days) + 2)));
    const standardOrderQuantity = Math.ceil((product.referenceDemand * 7) / product.orderLotSize) * product.orderLotSize;
    const row: Row = {
      id: product.id,
      organization_id: DEMO_ORGANIZATION_ID,
      sku: product.sku,
      jan_code: product.janCode,
      product_name: product.productName,
      product_name_kana: product.productNameKana,
      manufacturer: product.manufacturer,
      brand: product.brand,
      category_id: topCategoryId(product.topCode, categories),
      subcategory_id: subCategoryId(product.subCode, categories),
      specification: product.specification,
      content_amount: product.contentAmount,
      content_unit: product.contentUnit,
      sales_unit: product.salesUnit,
      purchase_unit: product.purchaseUnit,
      units_per_case: product.unitsPerCase,
      cost_price: product.costPrice,
      selling_price: product.sellingPrice,
      tax_rate: product.taxRate,
      storage_type: product.storageType,
      storage_temperature_min: product.temperatureMin,
      storage_temperature_max: product.temperatureMax,
      shelf_life_days: product.shelfLifeDays,
      expiration_warning_days: product.expirationWarningDays,
      safety_stock: safetyStock,
      reorder_point: reorderPoint,
      standard_order_quantity: standardOrderQuantity,
      minimum_order_quantity: product.orderLotSize,
      order_lot_size: product.orderLotSize,
      lead_time_days: primary.standard_lead_time_days,
      primary_supplier_id: primary.id,
      storage_location_note: product.storageLocationNote,
      notes: index % 13 === 0 ? "重点管理商品" : null,
      is_active: index % 97 !== 0,
      reference_demand: product.referenceDemand,
      top_code: product.topCode,
      search_text: `${product.sku} ${product.janCode} ${product.productName} ${product.productNameKana} ${product.manufacturer} ${product.brand}`.toLowerCase(),
      created_at: isoTime(addDays(now, -360 + (index % 120))),
      updated_at: isoTime(addDays(now, -(index % 45))),
    };
    productSuppliers.push({
      id: rng.uuid(),
      organization_id: DEMO_ORGANIZATION_ID,
      product_id: product.id,
      supplier_id: primary.id,
      supplier_product_code: `P-${pad(index + 1, 5)}`,
      purchase_price: product.costPrice,
      lead_time_days: primary.standard_lead_time_days,
      minimum_order_quantity: product.orderLotSize,
      order_lot_size: product.orderLotSize,
      is_primary: true,
      created_at: isoTime(addDays(now, -300)),
      updated_at: isoTime(addDays(now, -20)),
      suppliers: {
        code: primary.code,
        company_name: primary.company_name,
        standard_lead_time_days: primary.standard_lead_time_days,
      },
      products: {
        sku: product.sku,
        product_name: product.productName,
        storage_type: product.storageType,
        order_lot_size: product.orderLotSize,
        sales_unit: product.salesUnit,
        is_active: index % 97 !== 0,
      },
    });
    return row;
  });

  for (const supplier of suppliers) {
    const count = products.filter((product) => product.primary_supplier_id === supplier.id).length;
    supplier.products = [{ count }];
  }

  const balances: Row[] = [];
  const lots: Row[] = [];
  /** `${location_id}:${product_id}` → 先頭ロット（履歴・廃棄の参照先。線形探索を避ける） */
  const firstLotByPair = new Map<string, Row>();
  const reorderInputs: Row[] = [];
  for (const [locationIndex, location] of locations.entries()) {
    const demandFactor = Number(location.demand_factor);
    for (const [productIndex, product] of products.entries()) {
      const daily = Number(product.reference_demand) * demandFactor;
      const pattern = (productIndex + locationIndex * 7) % 31;
      const daysStock = pattern === 0 ? 0 : pattern < 5 ? 1 + pattern * 0.4 : pattern > 27 ? 65 + pattern : 8 + (pattern % 17);
      const onHand = Math.max(0, Math.round(daily * daysStock));
      const reserved = pattern % 11 === 0 ? Math.min(onHand, Math.round(daily)) : 0;
      const available = Math.max(0, onHand - reserved);
      const balanceId = `${location.id}:${product.id}`;
      balances.push({
        id: balanceId,
        organization_id: DEMO_ORGANIZATION_ID,
        location_id: location.id,
        product_id: product.id,
        quantity_on_hand: onHand,
        quantity_reserved: reserved,
        quantity_available: available,
        updated_at: isoTime(addDays(now, -(productIndex % 4))),
      });

      const productLots: Row[] = [];
      const lotCount = onHand === 0 ? 1 : 2 + ((productIndex + locationIndex) % 3);
      let remaining = onHand;
      for (let lotIndex = 0; lotIndex < lotCount; lotIndex += 1) {
        const last = lotIndex === lotCount - 1;
        const quantity = last ? remaining : Math.max(0, Math.floor(remaining / (lotCount - lotIndex)));
        remaining -= quantity;
        const expired = pattern === 6 && lotIndex === 0;
        const expiring = pattern % 13 === 0 && lotIndex === 0;
        const shelfDays = Number(product.shelf_life_days);
        const expirationOffset = expired ? -3 : expiring ? Math.min(3, Number(product.expiration_warning_days)) : Math.max(7, shelfDays - 8 * lotIndex);
        const received = addDays(now, -Math.min(shelfDays, 7 + lotIndex * 5));
        const status = pattern === 8 && lotIndex === 0 ? "quarantined" : quantity === 0 ? "depleted" : "available";
        const supplier = suppliers.find((item) => item.id === product.primary_supplier_id);
        const lot: Row = {
          id: rng.uuid(),
          organization_id: DEMO_ORGANIZATION_ID,
          location_id: location.id,
          product_id: product.id,
          lot_number: `${location.code}-${pad(productIndex + 1, 4)}-${pad(lotIndex + 1)}`,
          received_date: isoDate(received),
          manufacture_date: isoDate(addDays(received, -2)),
          expiration_date: isoDate(addDays(now, expirationOffset)),
          quantity_received: Math.max(quantity, Math.round(daily * 8)),
          quantity_remaining: quantity,
          unit_cost: product.cost_price,
          supplier_id: supplier?.id ?? null,
          purchase_order_id: null,
          receipt_id: null,
          source_lot_id: null,
          status,
          quarantine_reason: status === "quarantined" ? "品質確認中（販売デモ）" : null,
          created_at: isoTime(received),
          updated_at: isoTime(addDays(now, -(productIndex % 4))),
          locations: { name: location.name },
          products: {
            id: product.id,
            sku: product.sku,
            product_name: product.product_name,
            sales_unit: product.sales_unit,
            cost_price: product.cost_price,
            order_lot_size: product.order_lot_size,
            minimum_order_quantity: product.minimum_order_quantity,
            shelf_life_days: product.shelf_life_days,
            primary_supplier_id: product.primary_supplier_id,
          },
        };
        lots.push(lot);
        productLots.push(lot);
        if (lotIndex === 0) firstLotByPair.set(balanceId, lot);
      }

      const expiredQuantity = productLots
        .filter((lot) => String(lot.expiration_date) < isoDate(now) && Number(lot.quantity_remaining) > 0)
        .reduce((sum, lot) => sum + Number(lot.quantity_remaining), 0);
      const quarantinedQuantity = productLots
        .filter((lot) => lot.status === "quarantined")
        .reduce((sum, lot) => sum + Number(lot.quantity_remaining), 0);
      const usage30 = Math.round(daily * (24 + (productIndex % 8)));
      const usage7 = Math.round(daily * (5 + (productIndex % 3)));
      const supplier = suppliers.find((item) => item.id === product.primary_supplier_id);
      reorderInputs.push({
        location_id: location.id,
        location_name: location.name,
        product_id: product.id,
        sku: product.sku,
        product_name: product.product_name,
        jan_code: product.jan_code,
        category_name: categories.find((category) => category.id === product.category_id)?.name ?? null,
        sales_unit: product.sales_unit,
        storage_type: product.storage_type,
        units_per_case: product.units_per_case,
        cost_price: product.cost_price,
        safety_stock: product.safety_stock,
        reorder_point: product.reorder_point,
        standard_order_quantity: product.standard_order_quantity,
        minimum_order_quantity: product.minimum_order_quantity,
        order_lot_size: product.order_lot_size,
        lead_time_days: product.lead_time_days,
        shelf_life_days: product.shelf_life_days,
        expiration_warning_days: product.expiration_warning_days,
        supplier_id: supplier?.id ?? null,
        supplier_name: supplier?.company_name ?? null,
        quantity_on_hand: onHand,
        quantity_reserved: reserved,
        quantity_available: available,
        expired_quantity: expiredQuantity,
        quarantined_quantity: quarantinedQuantity,
        usable_lots: productLots
          .filter((lot) => lot.status === "available" && String(lot.expiration_date) >= isoDate(now))
          .map((lot) => ({ quantity: lot.quantity_remaining, expiration_date: lot.expiration_date })),
        usage_7d: usage7,
        usage_30d: usage30,
        usage_by_weekday: Array.from({ length: 7 }, (_, day) => Math.round((usage30 / 30) * (day === 0 || day === 6 ? 1.25 : 0.9) * 10) / 10),
        first_received_date: isoDate(addDays(now, -180 - (productIndex % 120))),
        waste_30d: pattern % 9 === 0 ? Math.round(daily * 1.5) : 0,
        incoming_quantity: pattern % 7 === 0 ? Number(product.standard_order_quantity) : 0,
        next_delivery_date: pattern % 7 === 0 ? isoDate(addDays(now, Number(product.lead_time_days))) : null,
      });
    }
  }

  const purchaseOrders: Row[] = [];
  const purchaseOrderItems: Row[] = [];
  for (let index = 0; index < 480; index += 1) {
    const supplier = suppliers[index % suppliers.length];
    const location = locations[index % locations.length];
    const status = ["draft", "ordered", "partially_received", "received", "cancelled"][index % 5];
    const orderDate = addDays(now, -(index % 90));
    const orderId = rng.uuid();
    const itemCount = 2 + (index % 6);
    const items: Row[] = [];
    for (let itemIndex = 0; itemIndex < itemCount; itemIndex += 1) {
      const product = products[(index * 7 + itemIndex * 13) % products.length];
      const ordered = Number(product.order_lot_size) * (1 + ((index + itemIndex) % 4));
      const received = status === "received" ? ordered : status === "partially_received" ? Math.floor(ordered / 2) : 0;
      const item: Row = {
        id: rng.uuid(),
        organization_id: DEMO_ORGANIZATION_ID,
        purchase_order_id: orderId,
        product_id: product.id,
        ordered_quantity: ordered,
        received_quantity: received,
        unit_cost: product.cost_price,
        tax_rate: product.tax_rate,
        subtotal: ordered * Number(product.cost_price),
        ai_recommended_quantity: index % 3 === 0 ? ordered : null,
        ai_reason: index % 3 === 0 ? "欠品リスクと入荷予定から算出" : null,
        created_at: isoTime(orderDate),
        updated_at: isoTime(orderDate),
        products: {
          id: product.id,
          sku: product.sku,
          product_name: product.product_name,
          sales_unit: product.sales_unit,
          purchase_unit: product.purchase_unit,
          units_per_case: product.units_per_case,
          cost_price: product.cost_price,
          shelf_life_days: product.shelf_life_days,
          primary_supplier_id: product.primary_supplier_id,
          tax_rate: product.tax_rate,
          order_lot_size: product.order_lot_size,
          minimum_order_quantity: product.minimum_order_quantity,
        },
      };
      items.push(item);
      purchaseOrderItems.push(item);
    }
    const subtotal = items.reduce((sum, item) => sum + Number(item.subtotal), 0);
    purchaseOrders.push({
      id: orderId,
      organization_id: DEMO_ORGANIZATION_ID,
      order_number: `PO-${isoDate(orderDate).replaceAll("-", "")}-${pad(index + 1, 4)}`,
      supplier_id: supplier.id,
      location_id: location.id,
      status,
      order_date: isoDate(orderDate),
      expected_delivery_date: isoDate(addDays(orderDate, Number(supplier.standard_lead_time_days))),
      subtotal,
      tax_amount: Math.floor(subtotal * 0.08),
      total_amount: subtotal + Math.floor(subtotal * 0.08),
      notes: index % 11 === 0 ? "AI発注提案から作成" : null,
      created_by: DEMO_OPERATOR_ID,
      ordered_at: status === "draft" ? null : isoTime(orderDate),
      received_at: status === "received" ? isoTime(addDays(orderDate, Number(supplier.standard_lead_time_days))) : null,
      cancelled_at: status === "cancelled" ? isoTime(addDays(orderDate, 1)) : null,
      created_at: isoTime(orderDate),
      updated_at: isoTime(orderDate),
      suppliers: {
        id: supplier.id,
        code: supplier.code,
        company_name: supplier.company_name,
        contact_name: supplier.contact_name,
        phone: supplier.phone,
        email: supplier.email,
        minimum_order_amount: supplier.minimum_order_amount,
      },
      locations: { name: location.name },
      profiles: { display_name: "デモ担当者" },
      purchase_order_items: items,
    });
    if (items[0]) items[0].count = itemCount;
  }

  for (const item of purchaseOrderItems) {
    const order = purchaseOrders.find((candidate) => candidate.id === item.purchase_order_id);
    if (order) {
      item.purchase_orders = {
        id: order.id,
        order_number: order.order_number,
        status: order.status,
        order_date: order.order_date,
        expected_delivery_date: order.expected_delivery_date,
      };
    }
  }

  const receipts: Row[] = Array.from({ length: 620 }, (_, index) => {
    const order = purchaseOrders[(index * 3) % purchaseOrders.length];
    const supplier = suppliers.find((item) => item.id === order.supplier_id) ?? suppliers[0];
    const location = locations.find((item) => item.id === order.location_id) ?? locations[0];
    const date = addDays(now, -(index % 75));
    return {
      id: rng.uuid(), organization_id: DEMO_ORGANIZATION_ID, receipt_number: `RC-${isoDate(date).replaceAll("-", "")}-${pad(index + 1, 4)}`,
      location_id: location.id, supplier_id: supplier.id, purchase_order_id: order.id, received_date: isoDate(date),
      total_quantity: 24 + (index % 180), total_amount: 8000 + (index % 31) * 1350, notes: index % 12 === 0 ? "検品済み" : null,
      created_by: DEMO_OPERATOR_ID, created_at: isoTime(addDays(date, 0.25)), locations: { name: location.name },
      suppliers: { company_name: supplier.company_name }, purchase_orders: { id: order.id, order_number: order.order_number },
      profiles: { display_name: "デモ担当者" },
    };
  });

  const issues: Row[] = Array.from({ length: 920 }, (_, index) => {
    const source = locations[index % locations.length];
    const issueType = ["sale", "usage", "transfer"][index % 3];
    const destination = issueType === "transfer" ? locations[(index + 1) % locations.length] : null;
    const date = addDays(now, -(index % 60) - (index % 18) / 24);
    return {
      id: rng.uuid(), organization_id: DEMO_ORGANIZATION_ID, issue_number: `IS-${isoDate(date).replaceAll("-", "")}-${pad(index + 1, 4)}`,
      location_id: source.id, destination_location_id: destination?.id ?? null, issue_type: issueType, total_quantity: 3 + (index % 84),
      notes: issueType === "transfer" ? "店舗間の在庫補充" : index % 8 === 0 ? "通常業務" : null,
      created_by: DEMO_OPERATOR_ID, created_at: isoTime(date), source: { name: source.name }, destination: destination ? { name: destination.name } : null,
      profiles: { display_name: "デモ担当者" },
    };
  });

  const wasteRecords: Row[] = Array.from({ length: 1280 }, (_, index) => {
    const product = products[(index * 17) % products.length];
    const location = locations[index % locations.length];
    const lot = firstLotByPair.get(`${location.id}:${product.id}`) ?? lots[0];
    const quantity = 1 + (index % 7);
    const date = addDays(now, -(index % 180));
    const reason = ["expired", "damaged", "quality_issue", "overstock", "other"][index % 5];
    return {
      id: rng.uuid(), organization_id: DEMO_ORGANIZATION_ID, location_id: location.id, product_id: product.id, lot_id: lot.id,
      waste_date: isoDate(date), quantity, unit_cost: product.cost_price, total_amount: quantity * Number(product.cost_price), reason,
      notes: index % 10 === 0 ? "売場確認時に登録" : null, recorded_by: DEMO_OPERATOR_ID, created_at: isoTime(addDays(date, 0.4)),
      products: { id: product.id, sku: product.sku, product_name: product.product_name, sales_unit: product.sales_unit },
      locations: { name: location.name }, inventory_lots: { lot_number: lot.lot_number }, profiles: { display_name: "デモ担当者" },
    };
  });

  const transactions: Row[] = Array.from({ length: 8200 }, (_, index) => {
    const product = products[(index * 29) % products.length];
    const location = locations[index % locations.length];
    const lot = firstLotByPair.get(`${location.id}:${product.id}`) ?? lots[0];
    const type =["receipt", "sale", "usage", "transfer_in", "transfer_out", "waste", "adjustment_plus", "adjustment_minus"][index % 8];
    const positive = type === "receipt" || type === "transfer_in" || type === "adjustment_plus";
    const quantity = (positive ? 1 : -1) * (1 + (index % 12));
    const before = positive ? 20 + (index % 80) : 30 + (index % 80);
    const date = addDays(now, -(index % 90) - (index % 24) / 24);
    return {
      id: rng.uuid(), organization_id: DEMO_ORGANIZATION_ID, location_id: location.id, product_id: product.id, lot_id: lot.id,
      transaction_type: type, quantity, before_quantity: before, after_quantity: before + quantity, unit_cost: product.cost_price,
      reference_type: type === "receipt" ? "receipt" : type === "waste" ? "waste" : "issue",
      reference_id: type === "receipt" ? receipts[index % receipts.length].id : type === "waste" ? wasteRecords[index % wasteRecords.length].id : issues[index % issues.length].id,
      reason: type === "sale" ? "販売" : type === "waste" ? "賞味期限・品質管理" : "デモ業務処理",
      performed_by: DEMO_OPERATOR_ID, created_at: isoTime(date), products: { id: product.id, sku: product.sku, product_name: product.product_name, product_name_kana: product.product_name_kana, jan_code: product.jan_code, sales_unit: product.sales_unit, search_text: product.search_text },
      locations: { name: location.name }, inventory_lots: { lot_number: lot.lot_number }, profiles: { display_name: "デモ担当者" },
    };
  });

  const stocktakes: Row[] = Array.from({ length: 16 }, (_, index) => {
    const location = locations[index % locations.length];
    const status = index === 0 ? "in_progress" : index % 6 === 0 ? "cancelled" : "completed";
    const started = addDays(now, -index * 14);
    return {
      id: rng.uuid(), organization_id: DEMO_ORGANIZATION_ID, stocktake_number: `ST-${isoDate(started).replaceAll("-", "")}-${pad(index + 1, 3)}`,
      location_id: location.id, category_id: null, status, notes: index === 0 ? "月次棚卸（デモ操作可能）" : "月次棚卸",
      started_at: isoTime(started), completed_at: status === "completed" ? isoTime(addDays(started, 0.2)) : null,
      created_by: DEMO_OPERATOR_ID, completed_by: status === "completed" ? DEMO_OPERATOR_ID : null, created_at: isoTime(started), updated_at: isoTime(started),
      locations: { name: location.name }, categories: null, creator: { display_name: "デモ担当者" }, completer: status === "completed" ? { display_name: "デモ担当者" } : null,
      stocktake_items: [{ count: index === 0 ? 1000 : 250 }],
    };
  });

  const balanceById = new Map(balances.map((balance) => [String(balance.id), balance]));
  const stocktakeItems: Row[] = products.map((product, index) => {
    const balance = balanceById.get(`${locations[0].id}:${product.id}`) ?? balances[0];
    const expected = Number(balance.quantity_on_hand);
    return {
      id: rng.uuid(), organization_id: DEMO_ORGANIZATION_ID, stocktake_id: stocktakes[0].id, product_id: product.id,
      expected_quantity: expected, actual_quantity: index < 12 ? null : expected + (index % 23 === 0 ? -1 : 0),
      difference_quantity: index < 12 ? null : index % 23 === 0 ? -1 : 0, adjusted_quantity: null, reason: null,
      products: { sku: product.sku, product_name: product.product_name, product_name_kana: product.product_name_kana, jan_code: product.jan_code, sales_unit: product.sales_unit, storage_location_note: product.storage_location_note, cost_price: product.cost_price },
    };
  });

  // RPC 用の派生行は公開テーブル名と衝突しない内部キーに保持する。
  const dataset: DemoDataset = {
    locations,
    categories,
    suppliers,
    products,
    product_suppliers: productSuppliers,
    inventory_balances: balances,
    inventory_lots: lots,
    inventory_transactions: transactions,
    purchase_orders: purchaseOrders,
    purchase_order_items: purchaseOrderItems,
    receipts,
    stock_issues: issues,
    stocktakes,
    stocktake_items: stocktakeItems,
    waste_records: wasteRecords,
  };
  Object.defineProperty(dataset, "reorder_inputs", { value: reorderInputs, enumerable: false });
  memoized = { day, dataset };
  return dataset;
}

export function getDemoReorderInputs(): Row[] {
  const dataset = getDemoDataset();
  return ((dataset as unknown as { reorder_inputs: Row[] }).reorder_inputs);
}

export function getDemoToday(): Date {
  return demoNow();
}

export function getDemoMonthLabels(): string[] {
  const now = demoNow();
  return Array.from({ length: 6 }, (_, index) => isoDate(addMonths(now, index - 5)).slice(0, 7));
}
