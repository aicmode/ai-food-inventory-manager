import "server-only";

import type { ServerSupabaseClient } from "@/lib/supabase/server";

import {
  DEMO_OPERATOR_ID,
  getDemoDataset,
  getDemoMonthLabels,
  getDemoReorderInputs,
  getDemoToday,
  type DemoDataset,
} from "./fixtures";

type Row = Record<string, unknown>;
type QueryResult = { data: Row[] | Row | null; error: null; count: number | null };
type Filter = (row: Row) => boolean;
type Order = { field: string; ascending: boolean; nullsFirst: boolean };

/** localeCompare(…, "ja") は呼び出しごとに Collator を生成して遅いため共有する */
const collator = new Intl.Collator("ja", { numeric: true });

function scalar(value: unknown): string | number | boolean | null {
  return typeof value === "string" || typeof value === "number" || typeof value === "boolean" || value === null ? value : String(value);
}

function valueAt(row: Row, path: string): unknown {
  return path.split(".").reduce<unknown>((value, part) => {
    if (typeof value !== "object" || value === null) return undefined;
    return (value as Row)[part];
  }, row);
}

function includesText(row: Row, field: string, needle: string): boolean {
  const direct = valueAt(row, field);
  if (typeof direct === "string" && direct.toLowerCase().includes(needle)) return true;
  const products = row.products;
  return typeof products === "object" && products !== null && String((products as Row)[field] ?? "").toLowerCase().includes(needle);
}

function parseOr(expression: string): Filter {
  const clauses = expression.split(",");
  return (row) => clauses.some((clause) => {
    const eqMatch = clause.match(/^([a-zA-Z0-9_]+)\.eq\.(.+)$/);
    if (eqMatch) return String(row[eqMatch[1]] ?? "") === eqMatch[2];
    const ilikeMatch = clause.match(/^([a-zA-Z0-9_]+)\.ilike\.\*(.*)\*$/);
    if (ilikeMatch) return includesText(row, ilikeMatch[1], ilikeMatch[2].toLowerCase());
    return false;
  });
}

const dateText = (date: Date) => date.toISOString().slice(0, 10);
const addDaysText = (date: Date, days: number) => dateText(new Date(date.getTime() + days * 86_400_000));

type DemoIndex = {
  products: Map<string, Row>;
  locations: Map<string, Row>;
  suppliers: Map<string, Row>;
  categories: Map<string, Row>;
  balancesByProduct: Map<string, Row[]>;
  /** search_inventory の派生行（拠点名・SKU順に整列済み） */
  inventoryRows: Row[];
  /** search_lots の派生行（賞味期限順に整列済み） */
  lotRows: Row[];
  dashboard: Row | null;
};

/** データセット（日単位で再生成）ごとに一度だけ索引と派生行を作る */
const indexes = new WeakMap<DemoDataset, DemoIndex>();

function groupBy(rows: Row[], key: (row: Row) => string): Map<string, Row[]> {
  const map = new Map<string, Row[]>();
  for (const row of rows) {
    const value = key(row);
    const group = map.get(value);
    if (group) group.push(row);
    else map.set(value, [row]);
  }
  return map;
}

function getIndex(): { dataset: DemoDataset; index: DemoIndex } {
  const dataset = getDemoDataset();
  const cached = indexes.get(dataset);
  if (cached) return { dataset, index: cached };

  const byId = (rows: Row[]) => new Map(rows.map((row) => [String(row.id), row]));
  const products = byId(dataset.products);
  const locations = byId(dataset.locations);
  const suppliers = byId(dataset.suppliers);
  const categories = byId(dataset.categories);
  const lotsByPair = groupBy(dataset.inventory_lots, (lot) => `${lot.location_id}:${lot.product_id}`);
  const todayDate = getDemoToday();
  const today = dateText(todayDate);

  const inventoryRows = dataset.inventory_balances.map((balance) => {
    const product = products.get(String(balance.product_id)) ?? dataset.products[0];
    const location = locations.get(String(balance.location_id)) ?? dataset.locations[0];
    const productLots = (lotsByPair.get(`${location.id}:${product.id}`) ?? []).filter((lot) => Number(lot.quantity_remaining) > 0);
    const nearest = [...productLots].sort((a, b) => String(a.expiration_date).localeCompare(String(b.expiration_date)))[0];
    const warningDate = addDaysText(todayDate, Number(product.expiration_warning_days));
    const expiringQuantity = productLots
      .filter((lot) => String(lot.expiration_date) >= today && String(lot.expiration_date) <= warningDate)
      .reduce((sum, lot) => sum + Number(lot.quantity_remaining), 0);
    const expiredQuantity = productLots.filter((lot) => String(lot.expiration_date) < today).reduce((sum, lot) => sum + Number(lot.quantity_remaining), 0);
    const available = Number(balance.quantity_available);
    const stockStatus = expiredQuantity > 0 ? "expired" : expiringQuantity > 0 ? "expiring" : available <= 0 ? "out_of_stock" : available <= Number(product.reorder_point) ? "low" : available > Number(product.reference_demand) * 55 ? "overstock" : "normal";
    return {
      product_id: product.id, location_id: location.id, product_name: product.product_name, sku: product.sku,
      location_name: location.name, storage_type: product.storage_type, quantity_on_hand: balance.quantity_on_hand,
      quantity_reserved: balance.quantity_reserved, quantity_available: balance.quantity_available, safety_stock: product.safety_stock,
      reorder_point: product.reorder_point, inventory_value: Number(balance.quantity_on_hand) * Number(product.cost_price),
      nearest_expiration_date: nearest?.expiration_date ?? null, expired_quantity: expiredQuantity, expiring_quantity: expiringQuantity,
      stock_status: stockStatus, sales_unit: product.sales_unit, updated_at: balance.updated_at, category_id: product.category_id,
      subcategory_id: product.subcategory_id, search_text: product.search_text,
    } satisfies Row;
  });
  inventoryRows.sort((left, right) => collator.compare(String(left.location_name), String(right.location_name)) || String(left.sku).localeCompare(String(right.sku)));

  const lotRows: Row[] = dataset.inventory_lots.map((lot) => {
    const product = products.get(String(lot.product_id)) ?? dataset.products[0];
    const location = locations.get(String(lot.location_id)) ?? dataset.locations[0];
    const supplier = suppliers.get(String(lot.supplier_id));
    const expiration = String(lot.expiration_date ?? "");
    const days = expiration ? Math.round((new Date(`${expiration}T00:00:00Z`).getTime() - new Date(`${today}T00:00:00Z`).getTime()) / 86_400_000) : null;
    const effectiveStatus = Number(lot.quantity_remaining) <= 0 ? "depleted" : lot.status === "quarantined" ? "quarantined" : days !== null && days < 0 ? "expired" : days !== null && days <= Number(product.expiration_warning_days) ? "expiring_soon" : "available";
    return {
      ...lot, product_name: product.product_name, sku: product.sku, jan_code: product.jan_code, sales_unit: product.sales_unit,
      storage_type: product.storage_type, location_name: location.name, supplier_name: supplier?.company_name ?? null,
      days_until_expiration: days, effective_status: effectiveStatus, search_text: `${product.search_text} ${lot.lot_number}`,
    };
  });
  lotRows.sort((left, right) => String(left.expiration_date ?? "9999").localeCompare(String(right.expiration_date ?? "9999")));

  const index: DemoIndex = {
    products,
    locations,
    suppliers,
    categories,
    balancesByProduct: groupBy(dataset.inventory_balances, (balance) => String(balance.product_id)),
    inventoryRows,
    lotRows,
    dashboard: null,
  };
  indexes.set(dataset, index);
  return { dataset, index };
}

class DemoQuery implements PromiseLike<QueryResult> {
  private readonly filters: Filter[] = [];
  private readonly orders: Order[] = [];
  private start: number | null = null;
  private end: number | null = null;
  private take: number | null = null;
  private returnCount = false;
  private singular: "single" | "maybeSingle" | null = null;
  private mutationRows: Row[] | null = null;

  constructor(private readonly table: keyof DemoDataset) {}

  select(columns = "*", options?: { count?: string }): this {
    void columns;
    this.returnCount = options?.count === "exact";
    return this;
  }

  eq(field: string, value: unknown): this {
    this.filters.push((row) => scalar(row[field]) === scalar(value));
    return this;
  }

  gt(field: string, value: number): this {
    this.filters.push((row) => Number(row[field]) > value);
    return this;
  }

  gte(field: string, value: string | number): this {
    this.filters.push((row) => String(row[field] ?? "") >= String(value));
    return this;
  }

  lte(field: string, value: string | number): this {
    this.filters.push((row) => String(row[field] ?? "") <= String(value));
    return this;
  }

  in(field: string, values: readonly unknown[]): this {
    this.filters.push((row) => values.some((value) => scalar(row[field]) === scalar(value)));
    return this;
  }

  ilike(field: string, pattern: string): this {
    const needle = pattern.replaceAll("*", "").replaceAll("%", "").toLowerCase();
    this.filters.push((row) => includesText(row, field, needle));
    return this;
  }

  or(expression: string, options?: { referencedTable?: string }): this {
    void options;
    this.filters.push(parseOr(expression));
    return this;
  }

  order(field: string, options?: { ascending?: boolean; nullsFirst?: boolean }): this {
    this.orders.push({ field, ascending: options?.ascending ?? true, nullsFirst: options?.nullsFirst ?? false });
    return this;
  }

  range(start: number, end: number): this {
    this.start = start;
    this.end = end;
    return this;
  }

  limit(value: number): this {
    this.take = value;
    return this;
  }

  insert(value: Row | Row[]): this {
    const first = Array.isArray(value) ? value[0] : value;
    const existing = getDemoDataset()[this.table][0] ?? {};
    this.mutationRows = [{ ...existing, ...first }];
    return this;
  }

  update(value: Row): this {
    this.mutationRows = [{ ...value }];
    return this;
  }

  single(): this {
    this.singular = "single";
    return this;
  }

  maybeSingle(): this {
    this.singular = "maybeSingle";
    return this;
  }

  private async execute(): Promise<QueryResult> {
    let rows = getDemoDataset()[this.table].filter((row) => this.filters.every((filter) => filter(row)));
    if (this.mutationRows) {
      // 登録・更新は結果形状だけを返し、共有fixtureには書き込まない
      const fallback = rows[0] ?? getDemoDataset()[this.table][0] ?? {};
      rows = this.mutationRows.map((row) => ({ ...fallback, ...row }));
    }
    const count = rows.length;
    if (this.orders.length > 0) {
      rows.sort((left, right) => {
        for (const order of this.orders) {
          const a = left[order.field];
          const b = right[order.field];
          if (a === b) continue;
          if (a === null || a === undefined) return order.nullsFirst ? -1 : 1;
          if (b === null || b === undefined) return order.nullsFirst ? 1 : -1;
          const compared = collator.compare(String(a), String(b));
          if (compared !== 0) return order.ascending ? compared : -compared;
        }
        return 0;
      });
    }
    if (this.start !== null && this.end !== null) rows = rows.slice(this.start, this.end + 1);
    if (this.take !== null) rows = rows.slice(0, this.take);
    // 固定データはプロセス内で共有するため、呼び出し側が結果を書き換えても他のリクエストへ波及させない。
    rows = structuredClone(rows);
    return {
      data: this.singular ? rows[0] ?? null : rows,
      error: null,
      count: this.returnCount ? count : null,
    };
  }

  then<TResult1 = QueryResult, TResult2 = never>(
    onfulfilled?: ((value: QueryResult) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ): Promise<TResult1 | TResult2> {
    return this.execute().then(onfulfilled, onrejected);
  }
}

function numberArg(args: Row, key: string, fallback: number): number {
  const value = Number(args[key]);
  return Number.isFinite(value) ? value : fallback;
}

function stringArg(args: Row, key: string): string | null {
  return typeof args[key] === "string" && args[key] ? String(args[key]) : null;
}

function matchesQuery(row: Row, query: string | undefined, alt: string | undefined): boolean {
  const text = String(row.search_text);
  return text.includes(query ?? "") || (alt ? text.includes(alt) : false);
}

function page(rows: Row[], args: Row): Row[] {
  const offset = numberArg(args, "p_offset", 0);
  const limit = numberArg(args, "p_limit", 25);
  const total = rows.length;
  return rows.slice(offset, offset + limit).map((row) => ({ ...row, total_count: total }));
}

function searchProducts(args: Row): Row[] {
  const { dataset, index } = getIndex();
  const query = stringArg(args, "p_query")?.toLowerCase();
  const alt = stringArg(args, "p_query_alt")?.toLowerCase();
  const locationId = stringArg(args, "p_location_id");
  const categoryId = stringArg(args, "p_category_id");
  const storage = stringArg(args, "p_storage_type");
  const supplierId = stringArg(args, "p_supplier_id");
  const stockFilter = stringArg(args, "p_stock_status");
  const active = typeof args.p_is_active === "boolean" ? args.p_is_active : null;
  let rows = dataset.products.map((product) => {
    const balances = (index.balancesByProduct.get(String(product.id)) ?? []).filter((balance) => !locationId || balance.location_id === locationId);
    const available = balances.reduce((sum, balance) => sum + Number(balance.quantity_available), 0);
    const daily = Number(product.reference_demand);
    const stockStatus = available <= 0 ? "out_of_stock" : available <= Number(product.reorder_point) ? "low" : available > daily * 55 ? "overstock" : "normal";
    return {
      id: product.id,
      sku: product.sku,
      jan_code: product.jan_code,
      product_name: product.product_name,
      manufacturer: product.manufacturer,
      brand: product.brand,
      category_name: index.categories.get(String(product.category_id))?.name ?? null,
      subcategory_name: index.categories.get(String(product.subcategory_id))?.name ?? null,
      storage_type: product.storage_type,
      supplier_name: index.suppliers.get(String(product.primary_supplier_id))?.company_name ?? null,
      supplier_id: product.primary_supplier_id,
      cost_price: product.cost_price,
      selling_price: product.selling_price,
      quantity_available: available,
      avg_daily_usage: daily,
      stock_status: stockStatus,
      sales_unit: product.sales_unit,
      is_active: product.is_active,
      updated_at: product.updated_at,
      search_text: product.search_text,
      category_id: product.category_id,
      subcategory_id: product.subcategory_id,
    } satisfies Row;
  });
  if (query || alt) rows = rows.filter((row) => matchesQuery(row, query, alt));
  if (categoryId) rows = rows.filter((row) => row.category_id === categoryId || row.subcategory_id === categoryId);
  if (storage) rows = rows.filter((row) => row.storage_type === storage);
  if (supplierId) rows = rows.filter((row) => row.supplier_id === supplierId);
  if (stockFilter) rows = rows.filter((row) => row.stock_status === stockFilter);
  if (active !== null) rows = rows.filter((row) => row.is_active === active);
  const sort = stringArg(args, "p_sort") ?? "sku";
  rows.sort((left, right) => {
    if (sort === "name") return collator.compare(String(left.product_name), String(right.product_name));
    if (sort === "stock_asc") return Number(left.quantity_available) - Number(right.quantity_available);
    if (sort === "stock_desc") return Number(right.quantity_available) - Number(left.quantity_available);
    if (sort === "updated") return String(right.updated_at).localeCompare(String(left.updated_at));
    return String(left.sku).localeCompare(String(right.sku));
  });
  return page(rows, args);
}

function searchInventory(args: Row): Row[] {
  const { index } = getIndex();
  const query = stringArg(args, "p_query")?.toLowerCase();
  const alt = stringArg(args, "p_query_alt")?.toLowerCase();
  const locationId = stringArg(args, "p_location_id");
  const categoryId = stringArg(args, "p_category_id");
  const storage = stringArg(args, "p_storage_type");
  const status = stringArg(args, "p_stock_status");
  const rows = index.inventoryRows.filter(
    (row) =>
      (!(query || alt) || matchesQuery(row, query, alt)) &&
      (!locationId || row.location_id === locationId) &&
      (!categoryId || row.category_id === categoryId || row.subcategory_id === categoryId) &&
      (!storage || row.storage_type === storage) &&
      (!status || row.stock_status === status),
  );
  return page(rows, args);
}

function searchLots(args: Row): Row[] {
  const { index } = getIndex();
  const query = stringArg(args, "p_query")?.toLowerCase();
  const alt = stringArg(args, "p_query_alt")?.toLowerCase();
  const locationId = stringArg(args, "p_location_id");
  const requestedStatus = stringArg(args, "p_status") ?? "active";
  const storage = stringArg(args, "p_storage_type");
  const rows = index.lotRows.filter(
    (row) =>
      (!(query || alt) || matchesQuery(row, query, alt)) &&
      (!locationId || row.location_id === locationId) &&
      (!storage || row.storage_type === storage) &&
      (requestedStatus === "all" ||
        (requestedStatus === "active" ? Number(row.quantity_remaining) > 0 : row.effective_status === requestedStatus)),
  );
  return page(rows, args);
}

function dashboardSummary(): Row {
  const { dataset, index } = getIndex();
  if (index.dashboard) return index.dashboard;
  const today = getDemoToday();
  const todayText = dateText(today);
  const month = todayText.slice(0, 7);
  const costOf = (productId: unknown) => Number(index.products.get(String(productId))?.cost_price ?? 0);
  const activeProducts = dataset.products.filter((product) => product.is_active);
  const activeLots = dataset.inventory_lots.filter((lot) => Number(lot.quantity_remaining) > 0);
  const wasteMonth = dataset.waste_records.filter((record) => String(record.waste_date).startsWith(month));
  const totalQuantity = dataset.inventory_balances.reduce((sum, balance) => sum + Number(balance.quantity_on_hand), 0);
  const totalValue = dataset.inventory_balances.reduce((sum, balance) => sum + Number(balance.quantity_on_hand) * costOf(balance.product_id), 0);
  const expiring = activeLots.filter((lot) => {
    const product = index.products.get(String(lot.product_id));
    const warning = addDaysText(today, Number(product?.expiration_warning_days ?? 3));
    return String(lot.expiration_date) >= todayText && String(lot.expiration_date) <= warning;
  });
  const expired = activeLots.filter((lot) => String(lot.expiration_date) < todayText);
  const categoryValues = dataset.categories.filter((category) => category.parent_id === null).map((category) => {
    const value = dataset.inventory_balances
      .filter((balance) => index.products.get(String(balance.product_id))?.category_id === category.id)
      .reduce((sum, balance) => sum + Number(balance.quantity_on_hand) * costOf(balance.product_id), 0);
    return { name: category.name, value };
  }).sort((a, b) => Number(b.value) - Number(a.value));
  const locationValues = dataset.locations.map((location) => {
    const balances = dataset.inventory_balances.filter((balance) => balance.location_id === location.id);
    return {
      name: location.name,
      type: location.type,
      quantity: balances.reduce((sum, balance) => sum + Number(balance.quantity_on_hand), 0),
      value: balances.reduce((sum, balance) => sum + Number(balance.quantity_on_hand) * costOf(balance.product_id), 0),
    };
  });
  const dailyFlow = Array.from({ length: 30 }, (_, dayIndex) => {
    const date = new Date(today.getTime() - (29 - dayIndex) * 86_400_000);
    return { date: dateText(date), inbound: 1800 + ((dayIndex * 137) % 850), outbound: 1600 + ((dayIndex * 173) % 900), waste: 28 + ((dayIndex * 17) % 80) };
  });
  const wasteMonthly = getDemoMonthLabels().map((label, monthIndex) => ({ month: `${label}-01`, amount: 118000 + monthIndex * 13700 + (monthIndex % 2) * 9200, quantity: 640 + monthIndex * 34 }));
  const recentTransactions = dataset.inventory_transactions.slice(0, 10).map((transaction) => ({
    id: transaction.id, transaction_type: transaction.transaction_type, quantity: transaction.quantity, created_at: transaction.created_at,
    product_id: (transaction.products as Row).id, sku: (transaction.products as Row).sku, product_name: (transaction.products as Row).product_name,
    sales_unit: (transaction.products as Row).sales_unit, location_name: (transaction.locations as Row).name,
  }));
  const openOrders = dataset.purchase_orders.filter((order) => ["draft", "ordered", "partially_received"].includes(String(order.status)));
  const pendingOrders = openOrders.slice(0, 10).map((order) => ({
    id: order.id, order_number: order.order_number, status: order.status, order_date: order.order_date,
    expected_delivery_date: order.expected_delivery_date, total_amount: order.total_amount,
    supplier_name: (order.suppliers as Row).company_name, location_name: (order.locations as Row).name,
  }));
  const todayReceipts = dataset.receipts.filter((receipt) => receipt.received_date === todayText);
  const todayIssues = dataset.stock_issues.filter((issue) => String(issue.created_at).startsWith(todayText));
  index.dashboard = {
    active_sku_count: activeProducts.length,
    total_quantity: totalQuantity,
    total_value: totalValue,
    expiring_soon_product_count: new Set(expiring.map((lot) => lot.product_id)).size,
    expired_product_count: new Set(expired.map((lot) => lot.product_id)).size,
    expired_quantity: expired.reduce((sum, lot) => sum + Number(lot.quantity_remaining), 0),
    waste_month_quantity: wasteMonth.reduce((sum, record) => sum + Number(record.quantity), 0),
    waste_month_amount: wasteMonth.reduce((sum, record) => sum + Number(record.total_amount), 0),
    outbound_month_quantity: 48500,
    open_purchase_order_count: openOrders.length,
    draft_purchase_order_count: dataset.purchase_orders.filter((order) => order.status === "draft").length,
    today_receipt_count: todayReceipts.length,
    today_receipt_quantity: todayReceipts.reduce((sum, receipt) => sum + Number(receipt.total_quantity), 0),
    today_issue_quantity: todayIssues.reduce((sum, issue) => sum + Number(issue.total_quantity), 0),
    today_issue_count: todayIssues.length,
    daily_flow: dailyFlow,
    category_values: categoryValues,
    location_values: locationValues,
    waste_monthly: wasteMonthly,
    waste_by_reason: [
      { reason: "expired", amount: 148000, quantity: 720 }, { reason: "damaged", amount: 62000, quantity: 245 },
      { reason: "quality", amount: 49000, quantity: 190 }, { reason: "overstock", amount: 37000, quantity: 160 },
    ],
    expiring_lots: expiring.slice(0, 10).map((lot) => {
      const product = index.products.get(String(lot.product_id)) ?? dataset.products[0];
      const location = index.locations.get(String(lot.location_id)) ?? dataset.locations[0];
      return { id: lot.id, lot_number: lot.lot_number, expiration_date: lot.expiration_date, quantity_remaining: lot.quantity_remaining, product_id: product.id, sku: product.sku, product_name: product.product_name, sales_unit: product.sales_unit, location_name: location.name };
    }),
    recent_transactions: recentTransactions,
    pending_purchase_orders: pendingOrders,
  };
  return index.dashboard;
}

async function demoRpc(name: string, args: Row = {}): Promise<{ data: unknown; error: null }> {
  const result = demoRpcData(name, args);
  return { data: structuredClone(result.data), error: null };
}

/**
 * 更新系RPCは入力検証済みの結果形状だけを返し、共有fixtureは一切変更しない。
 * 操作履歴はクライアント側でブラウザ内だけに保持する。
 */
function demoRpcData(name: string, args: Row): { data: unknown; error: null } {
  if (name === "search_products") return { data: searchProducts(args), error: null };
  if (name === "search_inventory") return { data: searchInventory(args), error: null };
  if (name === "search_lots") return { data: searchLots(args), error: null };
  if (name === "get_reorder_inputs") {
    const locationId = stringArg(args, "p_location_id");
    const productId = stringArg(args, "p_product_id");
    return { data: getDemoReorderInputs().filter((row) => (!locationId || row.location_id === locationId) && (!productId || row.product_id === productId)), error: null };
  }
  if (name === "get_dashboard_summary") return { data: dashboardSummary(), error: null };
  if (name === "create_purchase_orders_from_recommendations") {
    const firstOrder = getDemoDataset().purchase_orders[0];
    return { data: [{ id: firstOrder.id, order_number: firstOrder.order_number, supplier_name: (firstOrder.suppliers as Row).company_name, item_count: Array.isArray(args.p_items) ? args.p_items.length : 1, total_amount: firstOrder.total_amount }], error: null };
  }
  if (name === "create_purchase_order") return { data: getDemoDataset().purchase_orders[0].id, error: null };
  if (name === "receive_stock") return { data: getDemoDataset().receipts[0].id, error: null };
  if (name === "issue_stock") return { data: getDemoDataset().stock_issues[0].id, error: null };
  if (name === "create_stocktake") return { data: getDemoDataset().stocktakes[0].id, error: null };
  if (name === "complete_stocktake") return { data: 12, error: null };
  if (name === "record_waste") return { data: 1, error: null };
  return { data: null, error: null };
}

/**
 * 既存Server Componentが使うSupabase query形状を保持した読み取りアダプター。
 * 外部通信・cookie・秘密情報を一切使用しない。
 */
export function createDemoClient(): ServerSupabaseClient {
  const adapter = {
    from(table: string) {
      if (!(table in getDemoDataset())) throw new Error(`Demo table is not available: ${table}`);
      return new DemoQuery(table as keyof DemoDataset);
    },
    rpc(name: string, args?: Row) {
      return demoRpc(name, args);
    },
    auth: {
      async getClaims() {
        return { data: { claims: { sub: DEMO_OPERATOR_ID } }, error: null };
      },
    },
  };
  return adapter as unknown as ServerSupabaseClient;
}
