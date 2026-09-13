import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { createDemoClient } from "./client";
import { DEMO_ORGANIZATION_ID, getDemoDataset, getDemoReorderInputs } from "./fixtures";

type Row = Record<string, unknown>;
type DemoRpc = (name: string, args?: Row) => Promise<{ data: unknown; error: null }>;

const client = createDemoClient();
const rpc = (client as unknown as { rpc: DemoRpc }).rpc;

async function rpcRows(name: string, args: Row): Promise<Row[]> {
  const { data } = await rpc(name, args);
  if (!Array.isArray(data)) throw new Error(`${name} did not return rows`);
  return data as Row[];
}

describe("販売デモ用データ", () => {
  it("1,000 SKU・全国4拠点・40仕入先と業務履歴の規模を保持する", () => {
    const dataset = getDemoDataset();
    expect(dataset.products).toHaveLength(1000);
    expect(new Set(dataset.products.map((product) => product.sku)).size).toBe(1000);
    expect(dataset.locations).toHaveLength(4);
    expect(new Set(dataset.locations.map((location) => location.prefecture)).size).toBe(4);
    expect(dataset.suppliers).toHaveLength(40);
    expect(dataset.inventory_lots.length).toBeGreaterThan(10_000);
    expect(dataset.inventory_transactions.length).toBeGreaterThanOrEqual(8_000);
    expect(dataset.purchase_orders.length).toBeGreaterThan(0);
    expect(dataset.waste_records.length).toBeGreaterThan(0);
    expect(getDemoReorderInputs()).toHaveLength(4000);
  });
});

describe("販売デモ adapter", () => {
  it("商品検索はサーバー側でページングし、総件数を返す", async () => {
    const rows = await rpcRows("search_products", { p_limit: 25, p_offset: 25 });
    expect(rows).toHaveLength(25);
    expect(rows[0].total_count).toBe(1000);
    expect(rows[0].sku).not.toBe((await rpcRows("search_products", { p_limit: 25, p_offset: 0 }))[0].sku);
  });

  it("在庫一覧は拠点で絞り込める", async () => {
    const location = getDemoDataset().locations[1];
    const rows = await rpcRows("search_inventory", { p_location_id: location.id, p_limit: 50 });
    expect(rows).toHaveLength(50);
    expect(rows.every((row) => row.location_id === location.id)).toBe(true);
    expect(rows[0].total_count).toBe(1000);
  });

  it("キーワード検索で該当商品だけを返す", async () => {
    const target = getDemoDataset().products[123];
    const rows = await rpcRows("search_lots", { p_query: String(target.sku).toLowerCase(), p_status: "all", p_limit: 100 });
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every((row) => row.product_id === target.id)).toBe(true);
  });

  it("登録・更新・業務RPCを実行しても共有fixtureは変わらない", async () => {
    const dataset = getDemoDataset();
    const product = dataset.products[0];
    const originalName = product.product_name;
    const receiptCount = dataset.receipts.length;

    await client.from("products").update({ product_name: "第三者による変更" }).eq("id", String(product.id)).eq("organization_id", DEMO_ORGANIZATION_ID).select("id");
    await rpc("receive_stock", { p_items: [{ product_id: product.id, quantity: 10 }] });
    await rpc("record_waste", { p_product_id: product.id, p_quantity: 1 });

    expect(getDemoDataset().products[0].product_name).toBe(originalName);
    expect(getDemoDataset().receipts).toHaveLength(receiptCount);
  });

  it("呼び出し側が結果を書き換えても次のリクエストへ波及しない", async () => {
    const { data } = await client.from("products").select("id, product_name").order("sku").limit(1);
    const first = data?.[0];
    expect(first).toBeDefined();
    if (!first) return;
    first.product_name = "書き換え";

    const [inventoryRow] = await rpcRows("search_inventory", { p_limit: 1 });
    inventoryRow.quantity_available = -999;

    const again = await client.from("products").select("id, product_name").order("sku").limit(1);
    expect(again.data?.[0]?.product_name).not.toBe("書き換え");
    const [inventoryAgain] = await rpcRows("search_inventory", { p_limit: 1 });
    expect(inventoryAgain.quantity_available).not.toBe(-999);
  });
});
