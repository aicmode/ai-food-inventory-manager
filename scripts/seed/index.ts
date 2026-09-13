/**
 * 大規模デモデータ投入スクリプト。
 *
 *   npm run seed
 *
 * - 固定シード（SEED、既定 20260913）から商品・仕入先・在庫履歴を再現可能に生成する
 * - 日次の在庫シミュレーション（入荷→販売 FEFO→期限切れ廃棄→棚卸→発注点発注）で
 *   ロット・在庫・入出庫履歴・発注・入庫伝票・廃棄・棚卸の整合性を保ったまま生成する
 * - 日付はシード実行日（Asia/Tokyo）を基準に過去 SEED_HISTORY_DAYS 日分
 * - `runTodayOperations` は顧客環境の認証済みclientを明示的に渡した場合だけ、
 *   本日分の入庫・出庫・移動・廃棄・棚卸・AI発注をRPC経由で検証する
 *
 * 必要な環境変数: NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import { calculatePurchaseOrderTotals } from "../../src/lib/domain/inventory";
import { buildShortReason } from "../../src/lib/domain/reason-text";
import { RISK_ORDER, recommendOrder } from "../../src/lib/domain/recommendation";
import { toRecommendationInput } from "../../src/lib/domain/reorder-input";
import type { Database } from "../../src/lib/supabase/database.types";
import {
  CATEGORY_TREE,
  SEED_LOCATIONS,
  generateProducts,
  generateSuppliers,
  type GeneratedProduct,
  type GeneratedSupplier,
  type SeedLocation,
} from "./catalog";
import { Rng } from "./random";

type Tables = Database["public"]["Tables"];
type Insert<T extends keyof Tables> = Tables[T]["Insert"];
type Client = SupabaseClient<Database>;

// -----------------------------------------------------------------------------
// 設定
// -----------------------------------------------------------------------------
function intEnv(name: string, fallback: number, min: number, max: number): number {
  const raw = process.env[name]?.trim();
  if (!raw) return fallback;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < min || value > max) {
    throw new Error(`${name} は ${min}〜${max} の整数で指定してください（現在: ${raw}）`);
  }
  return value;
}

function requiredEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`環境変数 ${name} が未設定です。.env.local を確認してください。`);
  return value;
}

const SEED = intEnv("SEED", 20260913, 1, 2_147_483_647);
const PRODUCT_COUNT = intEnv("SEED_PRODUCT_COUNT", 1000, 50, 5000);
const SUPPLIER_COUNT = intEnv("SEED_SUPPLIER_COUNT", 40, 14, 60);
const HISTORY_DAYS = intEnv("SEED_HISTORY_DAYS", 45, 30, 120);
const DEMO_READONLY = process.env.DEMO_READONLY?.trim() === "true";
const ORGANIZATION_NAME = "フレッシュマート ONE（デモ）";

const DOW_FACTOR = [1.3, 0.85, 0.9, 0.95, 1.0, 1.1, 1.35];

// -----------------------------------------------------------------------------
// 日付ユーティリティ（Asia/Tokyo）
// -----------------------------------------------------------------------------
const MS_DAY = 86_400_000;
const pad = (n: number, len = 2) => String(n).padStart(len, "0");

function todayJst(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Tokyo", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
}
function addDays(date: string, days: number): string {
  return new Date(Date.parse(`${date}T00:00:00Z`) + days * MS_DAY).toISOString().slice(0, 10);
}
function weekdayOf(date: string): number {
  return new Date(`${date}T00:00:00Z`).getUTCDay();
}
function at(date: string, hour: number, minute: number): string {
  return `${date}T${pad(hour)}:${pad(Math.min(59, Math.max(0, minute)))}:00+09:00`;
}
function compact(date: string): string {
  return date.slice(2).replaceAll("-", "");
}
const round2 = (n: number) => Math.round(n * 100) / 100;
const roundUpTo = (n: number, lot: number) => Math.max(lot, Math.ceil(n / lot) * lot);
const roundDownTo = (n: number, lot: number) => Math.floor(n / lot) * lot;

class Numbering {
  private counters = new Map<string, number>();

  next(prefix: string, date: string): string {
    const period = date.slice(0, 4) + date.slice(5, 7);
    const key = `${prefix}|${period}`;
    const value = (this.counters.get(key) ?? 0) + 1;
    this.counters.set(key, value);
    return `${prefix}-${period}-${pad(value, 5)}`;
  }

  rows(organizationId: string): Insert<"document_sequences">[] {
    return [...this.counters.entries()].map(([key, value]) => {
      const [prefix, period] = key.split("|");
      return { organization_id: organizationId, prefix, period, last_value: value };
    });
  }
}

// -----------------------------------------------------------------------------
// シミュレーション用の状態
// -----------------------------------------------------------------------------
type LotRow = {
  id: string;
  organization_id: string;
  location_id: string;
  product_id: string;
  lot_number: string;
  received_date: string;
  manufacture_date: string | null;
  expiration_date: string;
  quantity_received: number;
  quantity_remaining: number;
  unit_cost: number;
  supplier_id: string | null;
  purchase_order_id: string | null;
  receipt_id: string | null;
  source_lot_id: null;
  status: "available" | "quarantined";
  quarantine_reason: string | null;
  created_at: string;
};

type PoItemState = { id: string; productId: string; ordered: number; received: number; unitCost: number };
type ReceiptState = { id: string; poId: string; locationId: string; supplierId: string; date: string; quantity: number; amount: number };
type PoState = {
  id: string;
  locationId: string;
  supplier: GeneratedSupplier;
  orderDate: string;
  arrivalDay: number;
  expectedDate: string;
  cancelled: boolean;
  partial: boolean;
  items: Map<string, PoItemState>;
  receipt: ReceiptState | null;
};
type IssueDoc = { id: string; locationId: string; date: string; type: "sale" | "usage"; total: number };
type StocktakeState = { id: string; locationId: string; day: number; date: string; items: Insert<"stocktake_items">[] };
type Location = SeedLocation & { id: string };

type PairResult = { usable: number; product: GeneratedProduct; location: Location };

type SimulationOutput = {
  lots: LotRow[];
  transactions: Insert<"inventory_transactions">[];
  wastes: Insert<"waste_records">[];
  pos: Map<string, PoState>;
  issueDocs: Map<string, IssueDoc>;
  stocktakes: StocktakeState[];
  pairs: PairResult[];
};

function simulate(params: {
  rng: Rng;
  organizationId: string;
  today: string;
  locations: Location[];
  products: GeneratedProduct[];
  primarySupplier: Map<string, GeneratedSupplier>;
  carried: Map<string, Set<string>>;
}): SimulationOutput {
  const { rng, organizationId: org, today, locations, products, primarySupplier, carried } = params;
  const startDay = -HISTORY_DAYS;
  const out: SimulationOutput = {
    lots: [],
    transactions: [],
    wastes: [],
    pos: new Map(),
    issueDocs: new Map(),
    stocktakes: locations.map((location) => {
      const day = location.type === "warehouse" ? -21 : -14;
      return { id: rng.uuid(), locationId: location.id, day, date: addDays(today, day), items: [] };
    }),
    pairs: [],
  };

  for (const location of locations) {
    const stocktake = out.stocktakes.find((st) => st.locationId === location.id);
    for (const product of products) {
      if (!carried.get(location.id)?.has(product.id)) continue;
      const supplier = primarySupplier.get(product.id);
      if (!supplier) throw new Error(`主要仕入先がありません: ${product.sku}`);

      const lotSize = product.orderLotSize;
      const shelf = product.shelfLifeDays;
      const demand = product.referenceDemand * location.demandFactor;
      const lots: LotRow[] = [];
      const pending: { arrivalDay: number; qty: number; po: PoState }[] = [];
      const shift = rng.chance(0.08) ? { from: -10, factor: rng.chance(0.5) ? 1.8 : 0.45 } : null;
      let onHand = 0;

      const change = (
        lot: LotRow,
        delta: number,
        type: Insert<"inventory_transactions">["transaction_type"],
        createdAt: string,
        referenceType: string | null,
        referenceId: string | null,
        reason: string | null,
      ) => {
        const before = onHand;
        onHand += delta;
        lot.quantity_remaining += delta;
        if (lot.quantity_remaining < 0 || onHand < 0) throw new Error(`負の在庫が発生しました: ${product.sku}`);
        out.transactions.push({
          organization_id: org,
          location_id: location.id,
          product_id: product.id,
          lot_id: lot.id,
          transaction_type: type,
          quantity: delta,
          before_quantity: before,
          after_quantity: onHand,
          unit_cost: lot.unit_cost,
          reference_type: referenceType,
          reference_id: referenceId,
          reason,
          created_at: createdAt,
        });
      };

      const newLot = (init: Omit<LotRow, "id" | "organization_id" | "location_id" | "product_id" | "quantity_remaining" | "source_lot_id" | "status" | "quarantine_reason">): LotRow => {
        const lot: LotRow = {
          id: rng.uuid(),
          organization_id: org,
          location_id: location.id,
          product_id: product.id,
          quantity_remaining: 0,
          source_lot_id: null,
          status: "available",
          quarantine_reason: null,
          ...init,
        };
        lots.push(lot);
        out.lots.push(lot);
        return lot;
      };

      const unitCostFor = () => round2(product.costPrice * rng.range(0.97, 1.03));

      // 初期在庫
      const initDate = addDays(today, startDay - 1);
      const initQty = roundUpTo(demand * Math.min(7, Math.max(1, shelf * 0.5)) + demand * 2, lotSize);
      const initExpiration = addDays(initDate, Math.max(2, Math.round(shelf * rng.range(0.7, 1))));
      const initLot = newLot({
        lot_number: `INIT-${compact(initDate)}-${rng.digits(3)}`,
        received_date: initDate,
        manufacture_date: addDays(initExpiration, -shelf),
        expiration_date: initExpiration,
        quantity_received: initQty,
        unit_cost: unitCostFor(),
        supplier_id: supplier.id,
        purchase_order_id: null,
        receipt_id: null,
        created_at: at(initDate, 8, 0),
      });
      change(initLot, initQty, "receipt", at(initDate, 8, 0), "seed", null, "初期在庫");

      for (let day = startDay; day <= -1; day += 1) {
        const date = addDays(today, day);
        const weekday = weekdayOf(date);

        // 1) 期限切れロットの廃棄（開店前）
        for (const lot of lots) {
          if (lot.quantity_remaining > 0 && lot.expiration_date < date && (day < -2 || rng.chance(0.5))) {
            const qty = lot.quantity_remaining;
            const wasteId = rng.uuid();
            change(lot, -qty, "waste", at(date, 7, 30), "waste", wasteId, "廃棄: 期限切れ");
            out.wastes.push({
              id: wasteId,
              organization_id: org,
              location_id: location.id,
              product_id: product.id,
              lot_id: lot.id,
              quantity: qty,
              reason: "expired",
              cost_amount: round2(qty * lot.unit_cost),
              waste_date: date,
              created_at: at(date, 7, 30),
            });
          }
        }

        const usableLots = () =>
          lots
            .filter((lot) => lot.quantity_remaining > 0 && lot.status === "available" && lot.expiration_date >= date)
            .sort((a, b) => (a.expiration_date === b.expiration_date ? (a.received_date < b.received_date ? -1 : 1) : a.expiration_date < b.expiration_date ? -1 : 1));

        // 2) 破損・品質不良（まれ）
        const damageRate = product.storageType === "room_temperature" ? 0.002 : 0.004;
        if (onHand > 0 && rng.chance(damageRate)) {
          const lot = usableLots()[0];
          if (lot) {
            const qty = Math.min(lot.quantity_remaining, rng.int(1, 2));
            const reason = rng.chance(0.6) ? "damaged" : "quality_issue";
            const wasteId = rng.uuid();
            change(lot, -qty, "waste", at(date, 11, rng.int(0, 59)), "waste", wasteId, reason === "damaged" ? "廃棄: 破損" : "廃棄: 品質不良");
            out.wastes.push({
              id: wasteId,
              organization_id: org,
              location_id: location.id,
              product_id: product.id,
              lot_id: lot.id,
              quantity: qty,
              reason,
              cost_amount: round2(qty * lot.unit_cost),
              waste_date: date,
              notes: reason === "damaged" ? "品出し時に破損" : "パッケージ不良",
              created_at: at(date, 11, 0),
            });
          }
        }

        // 3) 入荷
        for (let idx = pending.length - 1; idx >= 0; idx -= 1) {
          const entry = pending[idx];
          if (entry.arrivalDay !== day) continue;
          pending.splice(idx, 1);
          if (entry.po.cancelled) continue;
          const qty = entry.po.partial ? roundDownTo(entry.qty / 2, lotSize) : entry.qty;
          if (qty <= 0) continue;
          const item = entry.po.items.get(product.id);
          if (!item) throw new Error("発注明細の不整合");
          entry.po.receipt ??= {
            id: rng.uuid(),
            poId: entry.po.id,
            locationId: location.id,
            supplierId: entry.po.supplier.id,
            date,
            quantity: 0,
            amount: 0,
          };
          const receipt = entry.po.receipt;
          const manufacture = addDays(date, -rng.int(0, Math.min(3, Math.floor(shelf * 0.15))));
          const createdAt = at(date, 9, rng.int(0, 59));
          const lot = newLot({
            lot_number: `${compact(manufacture)}-${rng.digits(3)}`,
            received_date: date,
            manufacture_date: manufacture,
            expiration_date: addDays(manufacture, shelf),
            quantity_received: qty,
            unit_cost: item.unitCost,
            supplier_id: entry.po.supplier.id,
            purchase_order_id: entry.po.id,
            receipt_id: receipt.id,
            created_at: createdAt,
          });
          change(lot, qty, "receipt", createdAt, "receipt", receipt.id, null);
          item.received += qty;
          receipt.quantity += qty;
          receipt.amount = round2(receipt.amount + qty * item.unitCost);
        }

        // 4) 販売・出庫（FEFO）
        let mean = demand * DOW_FACTOR[weekday] * (shift && day >= shift.from ? shift.factor : 1);
        if (location.type === "warehouse") mean = [1, 3, 5].includes(weekday) ? mean * 2.3 : 0;
        let quantity = rng.poisson(mean);
        if (quantity > 0) {
          const docKey = `${location.id}|${date}`;
          let doc = out.issueDocs.get(docKey);
          if (!doc) {
            doc = { id: rng.uuid(), locationId: location.id, date, type: location.type === "warehouse" ? "usage" : "sale", total: 0 };
            out.issueDocs.set(docKey, doc);
          }
          let minute = rng.int(0, 40);
          for (const lot of usableLots()) {
            if (quantity <= 0) break;
            const take = Math.min(quantity, lot.quantity_remaining);
            change(lot, -take, doc.type, at(date, 20, minute), "issue", doc.id, doc.type === "sale" ? "POS売上計上" : "加工センター向け出庫");
            minute += 1;
            doc.total += take;
            quantity -= take;
          }
        }

        // 5) 棚卸
        if (stocktake && stocktake.day === day) {
          const expected = onHand;
          const r = rng.next();
          let delta = 0;
          if (r < 0.05 && onHand >= 2) delta = -rng.int(1, 2);
          else if (r < 0.06) delta = 1;
          const reason = delta < 0 ? rng.pick(["破損・汚損", "数量ロス（原因調査中）"]) : delta > 0 ? "前回計上漏れ" : null;
          if (delta < 0) {
            let remaining = -delta;
            const ordered = lots.filter((lot) => lot.quantity_remaining > 0).sort((a, b) => (a.expiration_date < b.expiration_date ? -1 : 1));
            for (const lot of ordered) {
              if (remaining <= 0) break;
              const take = Math.min(remaining, lot.quantity_remaining);
              change(lot, -take, "stocktake_adjustment", at(date, 21, 0), "stocktake", stocktake.id, `棚卸差異：${reason}`);
              remaining -= take;
            }
          } else if (delta > 0) {
            const lot = newLot({
              lot_number: `ST-${compact(date)}-ADJ`,
              received_date: date,
              manufacture_date: null,
              expiration_date: addDays(date, shelf),
              quantity_received: delta,
              unit_cost: product.costPrice,
              supplier_id: null,
              purchase_order_id: null,
              receipt_id: null,
              created_at: at(date, 21, 0),
            });
            change(lot, delta, "stocktake_adjustment", at(date, 21, 0), "stocktake", stocktake.id, `棚卸差異：${reason}`);
          }
          stocktake.items.push({
            organization_id: org,
            stocktake_id: stocktake.id,
            product_id: product.id,
            expected_quantity: expected,
            actual_quantity: expected + delta,
            adjusted_quantity: delta,
            reason,
            counted_at: at(date, 20, 30),
          });
        }

        // 6) 発注判断（仕入先の発注曜日）
        if (supplier.orderDays.includes(weekday)) {
          const usable = usableLots().reduce((sum, lot) => sum + lot.quantity_remaining, 0);
          const position = usable + pending.reduce((sum, entry) => sum + entry.qty, 0);
          const nextGap = (() => {
            for (let g = 1; g <= 7; g += 1) if (supplier.orderDays.includes((weekday + g) % 7)) return g;
            return 7;
          })();
          const safety = Math.max(1, Math.ceil(demand * 1.5));
          const need = demand * (supplier.leadTimeDays + nextGap) + safety;
          if (position <= need) {
            let qty = Math.max(need + demand * Math.min(3, shelf * 0.3) - position, lotSize);
            const cap = demand * (supplier.leadTimeDays + shelf * 0.8) + safety - position;
            if (cap > lotSize) qty = Math.min(qty, cap);
            qty = roundUpTo(qty, lotSize);

            const poKey = `${location.id}|${supplier.id}|${date}`;
            let po = out.pos.get(poKey);
            if (!po) {
              const arrivalDay = day + supplier.leadTimeDays;
              po = {
                id: rng.uuid(),
                locationId: location.id,
                supplier,
                orderDate: date,
                arrivalDay,
                expectedDate: addDays(today, arrivalDay),
                cancelled: arrivalDay < -3 && rng.chance(0.02),
                partial: arrivalDay >= -3 && arrivalDay <= -1 && rng.chance(0.15),
                items: new Map(),
                receipt: null,
              };
              out.pos.set(poKey, po);
            }
            po.items.set(product.id, { id: rng.uuid(), productId: product.id, ordered: qty, received: 0, unitCost: product.costPrice });
            pending.push({ arrivalDay: po.arrivalDay, qty, po });
          }
        }
      }

      const lotSum = lots.reduce((sum, lot) => sum + lot.quantity_remaining, 0);
      if (lotSum !== onHand) throw new Error(`ロット残数と在庫が一致しません: ${product.sku}`);
      const usableToday = lots
        .filter((lot) => lot.quantity_remaining > 0 && lot.expiration_date >= today)
        .reduce((sum, lot) => sum + lot.quantity_remaining, 0);
      out.pairs.push({ usable: usableToday, product, location });
    }
  }
  return out;
}

// -----------------------------------------------------------------------------
// DB 書き込み
// -----------------------------------------------------------------------------
async function insertAll<T extends keyof Tables>(client: Client, table: T, rows: Insert<T>[], label: string, size = 1000) {
  for (let i = 0; i < rows.length; i += size) {
    const chunk = rows.slice(i, i + size);
    // テーブル名がジェネリックなため、ここでは列の型を呼び出し側（Insert<T>）で保証している
    const { error } = await client.from(table).insert(chunk as never);
    if (error) throw new Error(`${label} の投入に失敗しました: ${error.message}`);
  }
  console.log(`  ${label}: ${rows.length.toLocaleString("ja-JP")} 件`);
}

async function findUserIdByEmail(admin: Client, email: string): Promise<string | null> {
  const target = email.toLowerCase();
  for (let page = 1; page <= 50; page += 1) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw new Error(`ユーザー一覧の取得に失敗しました: ${error.message}`);
    const found = data.users.find((user) => user.email?.toLowerCase() === target);
    if (found) return found.id;
    if (data.users.length < 200) return null;
  }
  return null;
}

async function main() {
  const url = requiredEnv("NEXT_PUBLIC_SUPABASE_URL");
  const serviceKey = requiredEnv("SUPABASE_SERVICE_ROLE_KEY");
  const isLocal = /^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?/.test(url);
  if (!isLocal && process.env.SEED_ALLOW_REMOTE?.trim() !== "true") {
    throw new Error("リモートの Supabase に seed を投入するには SEED_ALLOW_REMOTE=true を指定してください（誤投入防止）。");
  }

  const admin = createClient<Database>(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const rng = new Rng(SEED);
  const today = todayJst();
  const orgId = rng.uuid();

  console.log(`seed=${SEED} 商品=${PRODUCT_COUNT} 仕入先=${SUPPLIER_COUNT} 履歴=${HISTORY_DAYS}日 基準日=${today}`);

  // 既存のデモ組織を削除（関連データはカスケード削除）
  {
    const { error } = await admin.from("organizations").delete().eq("id", orgId);
    if (error) throw new Error(`既存デモ組織の削除に失敗しました: ${error.message}`);
  }

  // --- マスタ生成 ---
  const locations: Location[] = SEED_LOCATIONS.map((location) => ({ ...location, id: rng.uuid() }));
  const suppliers = generateSuppliers(rng, SUPPLIER_COUNT);
  const products = generateProducts(rng, PRODUCT_COUNT);

  const categoryIds = new Map<string, string>();
  const categoryRows: Insert<"categories">[] = [];
  CATEGORY_TREE.forEach((top, topIndex) => {
    const topId = rng.uuid();
    categoryIds.set(top.code, topId);
    categoryRows.push({ id: topId, organization_id: orgId, code: top.code, name: top.name, sort_order: (topIndex + 1) * 10 });
    top.subs.forEach((sub, subIndex) => {
      const code = `${top.code}-${pad(subIndex + 1)}`;
      const id = rng.uuid();
      categoryIds.set(code, id);
      categoryRows.push({ id, organization_id: orgId, parent_id: topId, code, name: sub, sort_order: (subIndex + 1) * 10 });
    });
  });

  const primarySupplier = new Map<string, GeneratedSupplier>();
  const secondarySupplier = new Map<string, GeneratedSupplier>();
  for (const product of products) {
    const candidates = suppliers.filter((supplier) => supplier.categories.includes(product.topCode));
    if (candidates.length === 0) throw new Error(`カテゴリ ${product.topCode} の仕入先がありません`);
    const primary = rng.pick(candidates);
    primarySupplier.set(product.id, primary);
    const others = candidates.filter((supplier) => supplier.id !== primary.id);
    if (others.length > 0 && rng.chance(0.25)) secondarySupplier.set(product.id, rng.pick(others));
  }

  const carried = new Map<string, Set<string>>(locations.map((location) => [location.id, new Set<string>()]));
  for (const product of products) {
    let any = false;
    for (const location of locations) {
      const rate =
        location.type === "warehouse"
          ? location.carryRate * (product.storageType === "refrigerated" || product.shelfLifeDays < 14 ? 0.35 : 1.4)
          : location.carryRate;
      if (rng.chance(rate)) {
        carried.get(location.id)?.add(product.id);
        if (location.type === "store") any = true;
      }
    }
    if (!any) carried.get(locations[0].id)?.add(product.id);
  }

  // --- シミュレーション ---
  console.log("在庫シミュレーションを実行しています...");
  const sim = simulate({ rng, organizationId: orgId, today, locations, products, primarySupplier, carried });

  // 品質確認中の隔離ロットをいくつか設定
  const quarantineCandidates = sim.lots.filter((lot) => lot.quantity_remaining > 0 && lot.expiration_date > addDays(today, 3));
  for (const lot of rng.shuffle(quarantineCandidates).slice(0, 6)) {
    lot.status = "quarantined";
    lot.quarantine_reason = rng.pick(["納品時の温度逸脱の疑い（品質確認中）", "外装破損のため検品待ち", "メーカーからの自主点検連絡"]);
  }

  // --- 伝票番号の採番（日付順） ---
  const numbering = new Numbering();
  const locationById = new Map(locations.map((location) => [location.id, location]));
  const pos = [...sim.pos.values()].sort(
    (a, b) =>
      a.orderDate.localeCompare(b.orderDate) ||
      (locationById.get(a.locationId)?.code ?? "").localeCompare(locationById.get(b.locationId)?.code ?? "") ||
      a.supplier.code.localeCompare(b.supplier.code),
  );
  const poRows: Insert<"purchase_orders">[] = [];
  const poItemRows: Insert<"purchase_order_items">[] = [];
  const productById = new Map(products.map((product) => [product.id, product]));
  for (const po of pos) {
    const items = [...po.items.values()];
    let status: Insert<"purchase_orders">["status"];
    if (po.cancelled) status = "cancelled";
    else if (po.arrivalDay >= 0) status = "ordered";
    else if (items.every((item) => item.received >= item.ordered)) status = "received";
    else if (items.some((item) => item.received > 0)) status = "partially_received";
    else status = "ordered";

    const totals = calculatePurchaseOrderTotals(items.map((item) => ({ quantity: item.ordered, unitCost: item.unitCost, taxRate: 8 })));
    poRows.push({
      id: po.id,
      organization_id: orgId,
      order_number: numbering.next("PO", po.orderDate),
      supplier_id: po.supplier.id,
      location_id: po.locationId,
      status,
      order_date: po.orderDate,
      expected_delivery_date: po.expectedDate,
      subtotal: totals.subtotal,
      tax_amount: totals.taxAmount,
      total_amount: totals.totalAmount,
      ordered_at: at(po.orderDate, 21, 30),
      received_at: status === "received" ? at(po.expectedDate, 9, 30) : null,
      cancelled_at: status === "cancelled" ? at(addDays(po.orderDate, 1), 10, 0) : null,
      notes: status === "cancelled" ? "仕入先欠品のためキャンセル" : null,
      created_at: at(po.orderDate, 21, 30),
      updated_at: at(po.orderDate, 21, 30),
    });
    for (const item of items) {
      poItemRows.push({
        id: item.id,
        organization_id: orgId,
        purchase_order_id: po.id,
        product_id: item.productId,
        ordered_quantity: item.ordered,
        received_quantity: item.received,
        unit_cost: item.unitCost,
        tax_rate: productById.get(item.productId)?.taxRate ?? 8,
        created_at: at(po.orderDate, 21, 30),
      });
    }
  }

  const receiptRows: Insert<"receipts">[] = pos
    .flatMap((po) => (po.receipt ? [po.receipt] : []))
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((receipt) => ({
      id: receipt.id,
      organization_id: orgId,
      receipt_number: numbering.next("RC", receipt.date),
      location_id: receipt.locationId,
      supplier_id: receipt.supplierId,
      purchase_order_id: receipt.poId,
      received_date: receipt.date,
      total_quantity: receipt.quantity,
      total_amount: receipt.amount,
      created_at: at(receipt.date, 10, 0),
    }));

  const issueRows: Insert<"stock_issues">[] = [...sim.issueDocs.values()]
    .sort((a, b) => a.date.localeCompare(b.date) || (locationById.get(a.locationId)?.code ?? "").localeCompare(locationById.get(b.locationId)?.code ?? ""))
    .map((doc) => ({
      id: doc.id,
      organization_id: orgId,
      issue_number: numbering.next("IS", doc.date),
      location_id: doc.locationId,
      issue_type: doc.type,
      total_quantity: doc.total,
      notes: doc.type === "sale" ? "POS売上データ取込（日次）" : "加工センター向け出庫（日次）",
      created_at: at(doc.date, 20, 0),
    }));

  const stocktakeRows: Insert<"stocktakes">[] = [...sim.stocktakes]
    .sort((a, b) => a.day - b.day)
    .map((st) => ({
      id: st.id,
      organization_id: orgId,
      stocktake_number: numbering.next("ST", st.date),
      location_id: st.locationId,
      status: "completed" as const,
      notes: "月次定期棚卸",
      started_at: at(st.date, 19, 0),
      completed_at: at(st.date, 21, 30),
      created_at: at(st.date, 19, 0),
      updated_at: at(st.date, 21, 30),
    }));

  // --- 投入 ---
  console.log("データベースへ投入しています...");
  await insertAll(admin, "organizations", [{ id: orgId, name: ORGANIZATION_NAME, review_period_days: 3, overstock_days: 45 }], "組織");
  await insertAll(
    admin,
    "locations",
    locations.map((location) => ({
      id: location.id,
      organization_id: orgId,
      code: location.code,
      name: location.name,
      type: location.type,
      postal_code: location.postalCode,
      prefecture: location.prefecture,
      city: location.city,
      address: location.address,
      phone: location.phone,
    })),
    "拠点",
  );
  await insertAll(admin, "categories", categoryRows.filter((row) => !row.parent_id), "カテゴリ（大分類）");
  await insertAll(admin, "categories", categoryRows.filter((row) => row.parent_id), "カテゴリ（小分類）");
  await insertAll(
    admin,
    "suppliers",
    suppliers.map((supplier) => ({
      id: supplier.id,
      organization_id: orgId,
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
      notes: `発注曜日: ${supplier.orderDays.map((d) => "日月火水木金土"[d]).join("・")}`,
    })),
    "仕入先",
  );
  await insertAll(
    admin,
    "products",
    products.map((product) => {
      const supplier = primarySupplier.get(product.id);
      const lead = supplier?.leadTimeDays ?? 2;
      const safety = Math.max(1, Math.ceil(product.referenceDemand * 1.5));
      return {
        id: product.id,
        organization_id: orgId,
        sku: product.sku,
        jan_code: product.janCode,
        product_name: product.productName,
        product_name_kana: product.productNameKana,
        manufacturer: product.manufacturer,
        brand: product.brand,
        category_id: categoryIds.get(product.topCode),
        subcategory_id: categoryIds.get(product.subCode),
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
        safety_stock: safety,
        reorder_point: Math.ceil(product.referenceDemand * lead + safety),
        standard_order_quantity: roundUpTo(product.referenceDemand * Math.min(7, Math.max(1, product.shelfLifeDays * 0.5)), product.orderLotSize),
        minimum_order_quantity: product.orderLotSize,
        order_lot_size: product.orderLotSize,
        lead_time_days: lead,
        primary_supplier_id: supplier?.id,
        storage_location_note: product.storageLocationNote,
      };
    }),
    "商品",
  );

  // 仕入先別の仕入条件（主要仕入先はトリガーで作成済みのため upsert）
  const productSupplierRows: Insert<"product_suppliers">[] = [];
  for (const product of products) {
    const primary = primarySupplier.get(product.id);
    if (primary) {
      productSupplierRows.push({
        organization_id: orgId,
        product_id: product.id,
        supplier_id: primary.id,
        supplier_product_code: `${primary.code.replace("SUP-", "S")}-${product.sku.slice(-4)}`,
        purchase_price: product.costPrice,
        is_primary: true,
      });
    }
    const secondary = secondarySupplier.get(product.id);
    if (secondary) {
      productSupplierRows.push({
        organization_id: orgId,
        product_id: product.id,
        supplier_id: secondary.id,
        supplier_product_code: `${secondary.code.replace("SUP-", "S")}-${product.sku.slice(-4)}`,
        purchase_price: round2(product.costPrice * 1.04),
        lead_time_days: secondary.leadTimeDays + 1,
        is_primary: false,
      });
    }
  }
  for (let i = 0; i < productSupplierRows.length; i += 1000) {
    const { error } = await admin
      .from("product_suppliers")
      .upsert(productSupplierRows.slice(i, i + 1000), { onConflict: "product_id,supplier_id" });
    if (error) throw new Error(`商品×仕入先の投入に失敗しました: ${error.message}`);
  }
  console.log(`  商品×仕入先: ${productSupplierRows.length.toLocaleString("ja-JP")} 件`);

  await insertAll(admin, "purchase_orders", poRows, "発注");
  await insertAll(admin, "purchase_order_items", poItemRows, "発注明細");
  await insertAll(admin, "receipts", receiptRows, "入庫伝票");
  await insertAll(admin, "stock_issues", issueRows, "出庫伝票");
  await insertAll(admin, "stocktakes", stocktakeRows, "棚卸");
  await insertAll(admin, "stocktake_items", sim.stocktakes.flatMap((st) => st.items), "棚卸明細");
  await insertAll(
    admin,
    "inventory_lots",
    sim.lots.map((lot) => ({ ...lot })),
    "ロット",
    500,
  );
  await insertAll(admin, "inventory_transactions", sim.transactions, "入出庫履歴");
  await insertAll(admin, "waste_records", sim.wastes, "廃棄記録");
  {
    const { error } = await admin.from("document_sequences").insert(numbering.rows(orgId));
    if (error) throw new Error(`伝票番号の初期化に失敗しました: ${error.message}`);
  }

  // --- 顧客環境のオーナー（任意） ---
  const ownerEmail = process.env.SEED_OWNER_EMAIL?.trim();
  if (ownerEmail) {
    const ownerId = await findUserIdByEmail(admin, ownerEmail);
    if (!ownerId) throw new Error(`SEED_OWNER_EMAIL のユーザーが見つかりません（先にサインアップしてください）: ${ownerEmail}`);
    const { error } = await admin.from("organization_members").upsert({ organization_id: orgId, user_id: ownerId, role: "owner" });
    if (error) throw new Error(`オーナーの追加に失敗しました: ${error.message}`);
    console.log(`  オーナー: ${ownerEmail}`);
  }

  if (DEMO_READONLY) {
    const { error } = await admin.from("organizations").update({ is_demo_readonly: true }).eq("id", orgId);
    if (error) throw new Error(`閲覧専用設定に失敗しました: ${error.message}`);
    console.log("  デモ組織を閲覧専用に設定しました。");
  }

  console.log("\n完了しました。");
}

export async function runTodayOperations(ctx: {
  operator: Client;
  admin: Client;
  orgId: string;
  today: string;
  rng: Rng;
  locations: Location[];
  pos: PoState[];
  productById: Map<string, GeneratedProduct>;
  pairs: PairResult[];
}) {
  const { operator, admin, orgId, today, rng, locations, pos, productById, pairs } = ctx;
  const stores = locations.filter((location) => location.type === "store");
  const warehouse = locations.find((location) => location.type === "warehouse");
  const fail = (label: string, message: string) => {
    throw new Error(`${label}に失敗しました: ${message}`);
  };

  console.log("本日分の業務操作を RPC で実行しています...");

  // 1) 本日着の発注を入庫
  const arrivingToday = pos.filter((po) => po.arrivalDay === 0 && !po.cancelled && stores.some((s) => s.id === po.locationId)).slice(0, 4);
  for (const po of arrivingToday) {
    const items = [...po.items.values()].map((item, index) => {
      const product = productById.get(item.productId);
      const shelf = product?.shelfLifeDays ?? 30;
      return {
        product_id: item.productId,
        quantity: item.ordered - item.received,
        lot_number: `${compact(today)}-${pad(index + 1, 3)}`,
        manufacture_date: addDays(today, -1),
        expiration_date: addDays(today, shelf - 1),
      };
    });
    const { error } = await operator.rpc("receive_stock", {
      p_organization_id: orgId,
      p_location_id: po.locationId,
      p_received_date: today,
      p_items: items,
      p_purchase_order_id: po.id,
      p_notes: "検品済み",
    });
    if (error) fail("入庫", error.message);
  }
  console.log(`  入庫（発注連携）: ${arrivingToday.length} 件`);

  // 2) 店舗の販売出庫
  let issueCount = 0;
  for (const store of stores) {
    const candidates = rng.shuffle(pairs.filter((pair) => pair.location.id === store.id && pair.usable >= 10)).slice(0, 5);
    if (candidates.length === 0) continue;
    const { error } = await operator.rpc("issue_stock", {
      p_organization_id: orgId,
      p_location_id: store.id,
      p_issue_type: "sale",
      p_items: candidates.map((pair) => ({ product_id: pair.product.id, quantity: rng.int(1, 3) })),
      p_notes: "午前のPOS売上取込",
    });
    if (error) fail("出庫", error.message);
    issueCount += 1;
  }
  console.log(`  販売出庫: ${issueCount} 件`);

  // 3) 倉庫から店舗への移動
  let transferCount = 0;
  if (warehouse) {
    for (const store of stores.slice(1)) {
      const storeProducts = new Set(pairs.filter((pair) => pair.location.id === store.id).map((pair) => pair.product.id));
      const candidates = rng
        .shuffle(pairs.filter((pair) => pair.location.id === warehouse.id && storeProducts.has(pair.product.id) && pair.usable >= pair.product.orderLotSize * 2 && pair.usable >= 12))
        .slice(0, 3);
      if (candidates.length === 0) continue;
      const { error } = await operator.rpc("issue_stock", {
        p_organization_id: orgId,
        p_location_id: warehouse.id,
        p_issue_type: "transfer",
        p_destination_location_id: store.id,
        p_items: candidates.map((pair) => ({ product_id: pair.product.id, quantity: Math.min(pair.product.orderLotSize, Math.floor(pair.usable / 2)) })),
        p_notes: "店舗補充（定期便）",
      });
      if (error) fail("拠点間移動", error.message);
      transferCount += 1;
    }
  }
  console.log(`  拠点間移動: ${transferCount} 件`);

  // 4) 廃棄
  const wasteTargets = rng.shuffle(pairs.filter((pair) => pair.location.id === stores[0].id && pair.usable >= 5 && pair.product.storageType === "refrigerated")).slice(0, 2);
  for (const pair of wasteTargets) {
    const { error } = await operator.rpc("record_waste", {
      p_organization_id: orgId,
      p_location_id: pair.location.id,
      p_product_id: pair.product.id,
      p_quantity: 1,
      p_reason: "damaged",
      p_waste_date: today,
      p_notes: "陳列時に容器破損",
    });
    if (error) fail("廃棄", error.message);
  }
  console.log(`  廃棄: ${wasteTargets.length} 件`);

  // 5) 進行中の棚卸（福岡天神店・乳製品）
  const stocktakeStore = stores.find((store) => store.code === "FUK") ?? stores[stores.length - 1];
  const { data: dairy, error: dairyError } = await admin.from("categories").select("id").eq("organization_id", orgId).eq("code", "DAIRY").single();
  if (dairyError) fail("カテゴリ取得", dairyError.message);
  const { data: stocktakeId, error: stocktakeError } = await operator.rpc("create_stocktake", {
    p_organization_id: orgId,
    p_location_id: stocktakeStore.id,
    p_category_id: dairy?.id,
    p_notes: "乳製品 週次棚卸",
  });
  if (stocktakeError || !stocktakeId) fail("棚卸開始", stocktakeError?.message ?? "unknown");
  const { data: stItems, error: stItemsError } = await operator
    .from("stocktake_items")
    .select("id, expected_quantity")
    .eq("stocktake_id", stocktakeId as string)
    .order("id")
    .limit(1000);
  if (stItemsError) fail("棚卸明細取得", stItemsError.message);
  const counted = (stItems ?? []).slice(0, Math.ceil((stItems ?? []).length / 2)).map((item, index) => {
    const diff = index % 9 === 4 && item.expected_quantity > 0 ? -1 : 0;
    return { item_id: item.id, actual_quantity: item.expected_quantity + diff, reason: diff !== 0 ? "陳列棚奥で破損品を発見" : null };
  });
  if (counted.length > 0) {
    const { error } = await operator.rpc("save_stocktake_counts", { p_stocktake_id: stocktakeId as string, p_items: counted });
    if (error) fail("棚卸カウント保存", error.message);
  }
  console.log(`  進行中の棚卸: 1 件（${counted.length}/${stItems?.length ?? 0} 品目カウント済み）`);

  // 6) AI 発注提案から下書き発注（東京中央店）
  const primaryStore = stores[0];
  const { data: inputs, error: inputsError } = await operator.rpc("get_reorder_inputs", { p_organization_id: orgId, p_location_id: primaryStore.id });
  if (inputsError) fail("発注判定データ取得", inputsError.message);
  const recommendations = (inputs ?? [])
    .map((row) => ({ row, result: recommendOrder(toRecommendationInput(row, { today, reviewPeriodDays: 3, overstockDays: 45 })) }))
    .filter(({ result, row }) => result.recommendedQuantity > 0 && row.supplier_id)
    .sort((a, b) => RISK_ORDER[b.result.shortageRisk] - RISK_ORDER[a.result.shortageRisk] || (a.result.daysOfStock ?? 0) - (b.result.daysOfStock ?? 0))
    .slice(0, 12);
  if (recommendations.length > 0) {
    const { data, error } = await operator.rpc("create_purchase_orders_from_recommendations", {
      p_organization_id: orgId,
      p_location_id: primaryStore.id,
      p_items: recommendations.map(({ row, result }) => ({
        product_id: row.product_id,
        ordered_quantity: result.recommendedQuantity,
        ai_recommended_quantity: result.recommendedQuantity,
        ai_reason: buildShortReason(result, row.sales_unit),
      })),
    });
    if (error) fail("AI発注提案からの発注書作成", error.message);
    console.log(`  AI発注提案からの下書き発注: ${Array.isArray(data) ? data.length : 0} 件（${recommendations.length} 品目）`);
  }

  await operator.auth.signOut();
}

main().catch((error: unknown) => {
  console.error(`\nseed に失敗しました: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
