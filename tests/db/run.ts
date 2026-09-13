/**
 * DB 統合テスト（RLS・組織分離・在庫 RPC の一貫性）
 *
 *   npm run test:db
 *
 * ローカルの Supabase（supabase start）に対して実行する。テスト用ユーザー・組織を作成し、終了時に削除する。
 * 必要な環境変数: NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY / SUPABASE_SERVICE_ROLE_KEY
 */
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "../../src/lib/supabase/database.types";

type Client = SupabaseClient<Database>;

const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";

if (!url || !anonKey || !serviceKey) {
  console.error("NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY / SUPABASE_SERVICE_ROLE_KEY を設定してください。");
  process.exit(1);
}
if (!/^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?/.test(url) && process.env.TEST_DB_ALLOW_REMOTE !== "true") {
  console.error("安全のため、ローカル Supabase 以外では実行しません（TEST_DB_ALLOW_REMOTE=true で許可）。");
  process.exit(1);
}

const admin: Client = createClient<Database>(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
const suffix = randomBytes(4).toString("hex");
const createdUsers: string[] = [];
const createdOrgs: string[] = [];
const results: { name: string; ok: boolean; error?: string }[] = [];

function jstDate(offsetDays = 0): string {
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Tokyo" }).format(new Date());
  return new Date(Date.parse(`${today}T00:00:00Z`) + offsetDays * 86_400_000).toISOString().slice(0, 10);
}

async function test(name: string, fn: () => Promise<void>) {
  try {
    await fn();
    results.push({ name, ok: true });
    console.log(`  ✓ ${name}`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    results.push({ name, ok: false, error: message });
    console.log(`  ✗ ${name}\n      ${message}`);
  }
}

async function signUpUser(label: string): Promise<{ client: Client; userId: string; email: string }> {
  const email = `dbtest-${label}-${suffix}@example.com`;
  const password = `Test-${randomBytes(9).toString("base64url")}1`;
  const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { display_name: `テスト${label}` } });
  if (error || !data.user) throw new Error(`ユーザー作成に失敗: ${error?.message}`);
  createdUsers.push(data.user.id);
  const client = createClient<Database>(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const signIn = await client.auth.signInWithPassword({ email, password });
  if (signIn.error) throw new Error(`ログインに失敗: ${signIn.error.message}`);
  return { client, userId: data.user.id, email };
}

async function balance(client: Client, locationId: string, productId: string): Promise<number> {
  const { data, error } = await client
    .from("inventory_balances")
    .select("quantity_on_hand")
    .eq("location_id", locationId)
    .eq("product_id", productId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data?.quantity_on_hand ?? 0;
}

async function main() {
  console.log("DB 統合テストを実行します…");
  const a = await signUpUser("a");
  const b = await signUpUser("b");
  const viewer = await signUpUser("viewer");

  // --- 準備: 組織 A / B ---
  const orgA = await a.client.rpc("create_organization", { p_name: `テスト組織A-${suffix}`, p_location_code: "STA", p_location_name: "テスト店A", p_location_type: "store" });
  const orgB = await b.client.rpc("create_organization", { p_name: `テスト組織B-${suffix}`, p_location_code: "STB", p_location_name: "テスト店B", p_location_type: "store" });
  assert.ok(orgA.data && orgB.data, `組織作成に失敗: ${orgA.error?.message ?? orgB.error?.message}`);
  const orgAId = orgA.data;
  const orgBId = orgB.data;
  createdOrgs.push(orgAId, orgBId);

  const locA = await a.client.from("locations").select("id").eq("organization_id", orgAId).single();
  const locB = await b.client.from("locations").select("id").eq("organization_id", orgBId).single();
  assert.ok(locA.data && locB.data);
  const locationA = locA.data.id;
  const locationB = locB.data.id;
  const locA2 = await a.client.from("locations").insert({ organization_id: orgAId, code: "WHA", name: "テスト倉庫A", type: "warehouse" }).select("id").single();
  assert.ok(locA2.data, locA2.error?.message);
  const warehouseA = locA2.data.id;

  const supplierA = await a.client.from("suppliers").insert({ organization_id: orgAId, code: "SUP-T1", company_name: "テスト仕入先", standard_lead_time_days: 2 }).select("id").single();
  assert.ok(supplierA.data, supplierA.error?.message);
  const productA = await a.client
    .from("products")
    .insert({
      organization_id: orgAId,
      sku: `TEST-${suffix}`,
      product_name: "テスト牛乳 1000ml",
      sales_unit: "本",
      cost_price: 150,
      selling_price: 228,
      storage_type: "refrigerated",
      shelf_life_days: 10,
      order_lot_size: 6,
      minimum_order_quantity: 6,
      primary_supplier_id: supplierA.data.id,
    })
    .select("id")
    .single();
  assert.ok(productA.data, productA.error?.message);
  const productId = productA.data.id;

  console.log("\n[組織分離・RLS]");
  await test("別組織の商品は参照できない", async () => {
    const { data, error } = await b.client.from("products").select("id").eq("organization_id", orgAId);
    assert.equal(error, null);
    assert.equal(data?.length, 0);
  });
  await test("別組織の商品は更新できない（0件更新）", async () => {
    const { data } = await b.client.from("products").update({ product_name: "改ざん" }).eq("id", productId).select("id");
    assert.equal(data?.length ?? 0, 0);
    const check = await admin.from("products").select("product_name").eq("id", productId).single();
    assert.equal(check.data?.product_name, "テスト牛乳 1000ml");
  });
  await test("別組織に商品を登録できない", async () => {
    const { error } = await b.client.from("products").insert({ organization_id: orgAId, sku: `EVIL-${suffix}`, product_name: "不正" });
    assert.ok(error, "エラーになるべき");
  });
  await test("自組織の商品に別組織の仕入先IDを指定できない（複合FK）", async () => {
    const { error } = await b.client
      .from("products")
      .insert({ organization_id: orgBId, sku: `XREF-${suffix}`, product_name: "参照テスト", primary_supplier_id: supplierA.data!.id });
    assert.ok(error);
    assert.equal(error.code, "23503");
  });
  await test("別組織の RPC（入庫・集計）は拒否される", async () => {
    const receive = await b.client.rpc("receive_stock", {
      p_organization_id: orgAId,
      p_location_id: locationA,
      p_received_date: jstDate(),
      p_items: [{ product_id: productId, quantity: 10 }],
    });
    assert.equal(receive.error?.code, "42501");
    const summary = await b.client.rpc("get_dashboard_summary", { p_organization_id: orgAId });
    assert.equal(summary.error?.code, "42501");
    const inputs = await b.client.rpc("get_reorder_inputs", { p_organization_id: orgAId });
    assert.equal(inputs.error?.code, "42501");
  });
  await test("自組織の RPC に別組織の拠点IDを指定しても処理されない", async () => {
    const { error } = await a.client.rpc("issue_stock", {
      p_organization_id: orgAId,
      p_location_id: locationB,
      p_issue_type: "sale",
      p_items: [{ product_id: productId, quantity: 1 }],
    });
    assert.equal(error?.code, "P0001");
    assert.match(error?.message ?? "", /拠点/);
  });
  await test("未ログイン（anon）は業務データにアクセスできない", async () => {
    const anon = createClient<Database>(url, anonKey, { auth: { persistSession: false } });
    const { data, error } = await anon.from("products").select("id").limit(1);
    assert.ok(error || (data ?? []).length === 0);
    const rpc = await anon.rpc("get_dashboard_summary", { p_organization_id: orgAId });
    assert.ok(rpc.error);
  });
  await test("在庫台帳は直接書き換えできない（RPC経由のみ）", async () => {
    const insert = await a.client.from("inventory_transactions").insert({
      organization_id: orgAId,
      location_id: locationA,
      product_id: productId,
      transaction_type: "receipt",
      quantity: 100,
      before_quantity: 0,
      after_quantity: 100,
    });
    assert.ok(insert.error);
    const lot = await a.client.from("inventory_lots").insert({
      organization_id: orgAId,
      location_id: locationA,
      product_id: productId,
      lot_number: "HACK",
      received_date: jstDate(),
      quantity_received: 999,
      quantity_remaining: 999,
    });
    assert.ok(lot.error);
  });

  console.log("\n[在庫操作・FEFO・一貫性]");
  await test("入庫でロット・在庫・履歴が作成される", async () => {
    const { error } = await a.client.rpc("receive_stock", {
      p_organization_id: orgAId,
      p_location_id: locationA,
      p_received_date: jstDate(),
      p_items: [
        { product_id: productId, quantity: 10, lot_number: "LATE", expiration_date: jstDate(9) },
        { product_id: productId, quantity: 5, lot_number: "EARLY", expiration_date: jstDate(3) },
        { product_id: productId, quantity: 4, lot_number: "EXPIRED", expiration_date: jstDate(-1) },
      ],
    });
    assert.equal(error, null, error?.message);
    assert.equal(await balance(a.client, locationA, productId), 19);
  });
  await test("出庫は FEFO（期限の早いロットから・期限切れは対象外）", async () => {
    const { data: issueId, error } = await a.client.rpc("issue_stock", {
      p_organization_id: orgAId,
      p_location_id: locationA,
      p_issue_type: "sale",
      p_items: [{ product_id: productId, quantity: 7 }],
    });
    assert.equal(error, null, error?.message);
    const lots = await a.client.from("inventory_lots").select("lot_number, quantity_remaining").eq("product_id", productId).eq("location_id", locationA);
    const byNumber = Object.fromEntries((lots.data ?? []).map((l) => [l.lot_number, l.quantity_remaining]));
    assert.deepEqual(byNumber, { EARLY: 0, LATE: 8, EXPIRED: 4 });
    const txs = await a.client.from("inventory_transactions").select("quantity, before_quantity, after_quantity").eq("reference_id", issueId!).order("created_at");
    assert.equal(txs.data?.length, 2);
    for (const tx of txs.data ?? []) assert.equal(tx.after_quantity, tx.before_quantity + tx.quantity);
    assert.equal(await balance(a.client, locationA, productId), 12);
  });
  await test("在庫不足の出庫は失敗し、在庫は一切変わらない（負の在庫禁止）", async () => {
    const before = await balance(a.client, locationA, productId);
    const { error } = await a.client.rpc("issue_stock", {
      p_organization_id: orgAId,
      p_location_id: locationA,
      p_issue_type: "sale",
      p_items: [{ product_id: productId, quantity: 10 }],
    });
    assert.equal(error?.code, "P0001");
    assert.match(error?.message ?? "", /不足/);
    assert.equal(await balance(a.client, locationA, productId), before);
  });
  await test("拠点間移動で移動先にロット（期限を引き継ぐ）が作成される", async () => {
    const { error } = await a.client.rpc("issue_stock", {
      p_organization_id: orgAId,
      p_location_id: locationA,
      p_issue_type: "transfer",
      p_destination_location_id: warehouseA,
      p_items: [{ product_id: productId, quantity: 3 }],
    });
    assert.equal(error, null, error?.message);
    assert.equal(await balance(a.client, locationA, productId), 9);
    assert.equal(await balance(a.client, warehouseA, productId), 3);
    const lot = await a.client.from("inventory_lots").select("lot_number, expiration_date").eq("location_id", warehouseA).single();
    assert.equal(lot.data?.lot_number, "LATE");
    assert.equal(lot.data?.expiration_date, jstDate(9));
  });
  await test("廃棄は期限切れロットから減算し、原価で金額を記録する", async () => {
    const { error } = await a.client.rpc("record_waste", {
      p_organization_id: orgAId,
      p_location_id: locationA,
      p_product_id: productId,
      p_quantity: 4,
      p_reason: "expired",
      p_waste_date: jstDate(),
    });
    assert.equal(error, null, error?.message);
    const waste = await a.client.from("waste_records").select("quantity, cost_amount, inventory_lots(lot_number)").eq("product_id", productId);
    assert.equal(waste.data?.length, 1);
    assert.equal(waste.data?.[0].inventory_lots?.lot_number, "EXPIRED");
    assert.equal(waste.data?.[0].cost_amount, 600);
    assert.equal(await balance(a.client, locationA, productId), 5);
  });
  await test("棚卸確定で差異が在庫に反映される", async () => {
    const created = await a.client.rpc("create_stocktake", { p_organization_id: orgAId, p_location_id: locationA });
    assert.ok(created.data, created.error?.message);
    const items = await a.client.from("stocktake_items").select("id, expected_quantity").eq("stocktake_id", created.data);
    assert.equal(items.data?.[0].expected_quantity, 5);
    const saved = await a.client.rpc("save_stocktake_counts", { p_stocktake_id: created.data, p_items: [{ item_id: items.data![0].id, actual_quantity: 3, reason: "破損" }] });
    assert.equal(saved.error, null, saved.error?.message);
    const completed = await a.client.rpc("complete_stocktake", { p_stocktake_id: created.data });
    assert.equal(completed.error, null, completed.error?.message);
    assert.equal(await balance(a.client, locationA, productId), 3);
    const again = await a.client.rpc("complete_stocktake", { p_stocktake_id: created.data });
    assert.equal(again.error?.code, "P0001");
  });

  console.log("\n[発注・入荷連携]");
  await test("発注単位に合わない数量は拒否される", async () => {
    const { error } = await a.client.rpc("create_purchase_order", {
      p_organization_id: orgAId,
      p_supplier_id: supplierA.data!.id,
      p_location_id: locationA,
      p_items: [{ product_id: productId, ordered_quantity: 7 }],
    });
    assert.equal(error?.code, "P0001");
    assert.match(error?.message ?? "", /発注単位/);
  });
  await test("発注→確定→一部入荷→入荷完了で状態が遷移する", async () => {
    const created = await a.client.rpc("create_purchase_order", {
      p_organization_id: orgAId,
      p_supplier_id: supplierA.data!.id,
      p_location_id: locationA,
      p_items: [{ product_id: productId, ordered_quantity: 12 }],
    });
    assert.ok(created.data, created.error?.message);
    const po = await a.client.from("purchase_orders").select("status, subtotal, tax_amount, total_amount").eq("id", created.data).single();
    assert.deepEqual(po.data, { status: "draft", subtotal: 1800, tax_amount: 144, total_amount: 1944 });
    const early = await a.client.rpc("receive_stock", { p_organization_id: orgAId, p_location_id: locationA, p_received_date: jstDate(), p_purchase_order_id: created.data, p_items: [{ product_id: productId, quantity: 6 }] });
    assert.equal(early.error?.code, "P0001", "下書きの発注は入庫できない");
    assert.equal((await a.client.rpc("set_purchase_order_status", { p_purchase_order_id: created.data, p_status: "ordered" })).error, null);
    const partial = await a.client.rpc("receive_stock", { p_organization_id: orgAId, p_location_id: locationA, p_received_date: jstDate(), p_purchase_order_id: created.data, p_items: [{ product_id: productId, quantity: 6, expiration_date: jstDate(10) }] });
    assert.equal(partial.error, null, partial.error?.message);
    assert.equal((await a.client.from("purchase_orders").select("status").eq("id", created.data).single()).data?.status, "partially_received");
    const over = await a.client.rpc("receive_stock", { p_organization_id: orgAId, p_location_id: locationA, p_received_date: jstDate(), p_purchase_order_id: created.data, p_items: [{ product_id: productId, quantity: 7 }] });
    assert.equal(over.error?.code, "P0001", "発注残を超える入庫は拒否");
    const rest = await a.client.rpc("receive_stock", { p_organization_id: orgAId, p_location_id: locationA, p_received_date: jstDate(), p_purchase_order_id: created.data, p_items: [{ product_id: productId, quantity: 6, expiration_date: jstDate(10) }] });
    assert.equal(rest.error, null, rest.error?.message);
    assert.equal((await a.client.from("purchase_orders").select("status").eq("id", created.data).single()).data?.status, "received");
    const cancel = await a.client.rpc("set_purchase_order_status", { p_purchase_order_id: created.data, p_status: "cancelled" });
    assert.equal(cancel.error?.code, "P0001", "入荷済みはキャンセル不可");
  });
  await test("AI提案からの一括作成は仕入先ごとに発注書を分ける", async () => {
    const supplier2 = await a.client.from("suppliers").insert({ organization_id: orgAId, code: "SUP-T2", company_name: "テスト仕入先2" }).select("id").single();
    const product2 = await a.client
      .from("products")
      .insert({ organization_id: orgAId, sku: `TEST2-${suffix}`, product_name: "テスト食パン", primary_supplier_id: supplier2.data!.id, order_lot_size: 1, minimum_order_quantity: 1 })
      .select("id")
      .single();
    const { data, error } = await a.client.rpc("create_purchase_orders_from_recommendations", {
      p_organization_id: orgAId,
      p_location_id: locationA,
      p_items: [
        { product_id: productId, ordered_quantity: 18, ai_recommended_quantity: 18, ai_reason: "テスト" },
        { product_id: product2.data!.id, ordered_quantity: 5, ai_recommended_quantity: 5, ai_reason: "テスト" },
      ],
    });
    assert.equal(error, null, error?.message);
    assert.ok(Array.isArray(data));
    assert.equal(data.length, 2);
  });

  console.log("\n[ロール権限]");
  await test("閲覧者は参照できるが、入庫・商品登録はできない", async () => {
    const added = await a.client.rpc("add_organization_member", { p_organization_id: orgAId, p_email: viewer.email, p_role: "viewer" });
    assert.equal(added.error, null, added.error?.message);
    const products = await viewer.client.from("products").select("id").eq("organization_id", orgAId);
    assert.ok((products.data?.length ?? 0) >= 1);
    const receive = await viewer.client.rpc("receive_stock", { p_organization_id: orgAId, p_location_id: locationA, p_received_date: jstDate(), p_items: [{ product_id: productId, quantity: 1 }] });
    assert.equal(receive.error?.code, "42501");
    const insert = await viewer.client.from("products").insert({ organization_id: orgAId, sku: `VIEW-${suffix}`, product_name: "閲覧者" });
    assert.ok(insert.error);
  });
  await test("最後のオーナーは降格できない", async () => {
    const { error } = await a.client.rpc("update_organization_member_role", { p_organization_id: orgAId, p_user_id: a.userId, p_role: "admin" });
    assert.equal(error?.code, "P0001");
  });
  await test("閲覧専用のデモ組織では書き込み RPC が拒否される", async () => {
    await admin.from("organizations").update({ is_demo_readonly: true }).eq("id", orgAId);
    const { error } = await a.client.rpc("issue_stock", { p_organization_id: orgAId, p_location_id: locationA, p_issue_type: "sale", p_items: [{ product_id: productId, quantity: 1 }] });
    assert.equal(error?.code, "42501");
    await admin.from("organizations").update({ is_demo_readonly: false }).eq("id", orgAId);
  });
}

async function cleanup() {
  for (const orgId of createdOrgs) {
    const { error } = await admin.from("organizations").delete().eq("id", orgId);
    if (error) console.error(`組織の削除に失敗: ${error.message}`);
  }
  for (const userId of createdUsers) {
    const { error } = await admin.auth.admin.deleteUser(userId);
    if (error) console.error(`ユーザーの削除に失敗: ${error.message}`);
  }
}

main()
  .catch((error: unknown) => {
    results.push({ name: "テスト準備", ok: false, error: error instanceof Error ? error.message : String(error) });
    console.error(error);
  })
  .finally(async () => {
    await cleanup();
    const failed = results.filter((r) => !r.ok);
    console.log(`\n結果: ${results.length - failed.length} / ${results.length} 件成功`);
    if (failed.length > 0) process.exitCode = 1;
  });
