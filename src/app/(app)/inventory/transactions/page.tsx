import type { Metadata } from "next";
import { History } from "lucide-react";
import Link from "next/link";

import { FilterBar, FilterSelect, FilterText } from "@/components/ui/filter-bar";
import { Pagination, PAGE_SIZE, parsePage } from "@/components/ui/pagination";
import { Badge, Card, EmptyState, PageHeader, TableContainer, td, tdRight, th, thRight, tr } from "@/components/ui/primitives";
import { requireOrgContext } from "@/lib/auth/context";
import { activeLocationOptions, getLocations } from "@/lib/data/lookups";
import { logDbError } from "@/lib/errors";
import { formatCurrency, formatDateTime, formatQuantity, normalizeSearchQuery } from "@/lib/format";
import { TRANSACTION_TYPE_LABELS, TRANSACTION_TYPE_TONES, label } from "@/lib/labels";
import { dateParam, enumParam, sanitizeFilterText, textParam, uuidParam } from "@/lib/search-params";

export const metadata: Metadata = { title: "入出庫履歴" };

const TYPES = [
  "receipt",
  "sale",
  "usage",
  "transfer_in",
  "transfer_out",
  "adjustment_plus",
  "adjustment_minus",
  "waste",
  "stocktake_adjustment",
] as const;

const REFERENCE_LINKS: Record<string, (id: string) => string> = {
  receipt: () => "/receipts",
  issue: () => "/issues",
  stocktake: (id) => `/stocktakes/${id}`,
  waste: () => "/waste",
};

export default async function TransactionsPage({ searchParams }: PageProps<"/inventory/transactions">) {
  const params = await searchParams;
  const context = await requireOrgContext();
  const { supabase, organization } = context;
  const query = textParam(params, "q");
  const type = enumParam(params, "type", TYPES);
  const locationId = uuidParam(params, "location");
  const productId = uuidParam(params, "product");
  const referenceId = uuidParam(params, "reference");
  const from = dateParam(params, "from");
  const to = dateParam(params, "to");
  const page = parsePage(params.page);

  let request = supabase
    .from("inventory_transactions")
    .select(
      "id, transaction_type, quantity, before_quantity, after_quantity, unit_cost, reference_type, reference_id, reason, created_at, locations(name), products!inner(id, sku, product_name, sales_unit), inventory_lots(lot_number), profiles(display_name)",
      { count: "exact" },
    )
    .eq("organization_id", organization.id)
    .order("created_at", { ascending: false })
    .range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1);

  if (type) request = request.eq("transaction_type", type);
  if (locationId) request = request.eq("location_id", locationId);
  if (productId) request = request.eq("product_id", productId);
  if (referenceId) request = request.eq("reference_id", referenceId);
  if (from) request = request.gte("created_at", `${from}T00:00:00+09:00`);
  if (to) request = request.lte("created_at", `${to}T23:59:59.999+09:00`);
  if (query) {
    const normalized = normalizeSearchQuery(query);
    const primary = sanitizeFilterText(normalized.primary).toLowerCase();
    const kana = normalized.kana ? sanitizeFilterText(normalized.kana).toLowerCase() : null;
    if (primary) {
      request = request.or(
        kana ? `search_text.ilike.*${primary}*,search_text.ilike.*${kana}*` : `search_text.ilike.*${primary}*`,
        { referencedTable: "products" },
      );
    }
  }

  const [locations, result] = await Promise.all([getLocations(supabase, organization.id), request]);
  if (result.error) {
    logDbError("transactions list", result.error);
    throw new Error("入出庫履歴の読み込みに失敗しました。");
  }
  const rows = result.data;
  const total = result.count ?? 0;

  return (
    <>
      <PageHeader title="入出庫履歴" description="すべての在庫変動をロット単位で記録しています。数量は増減量（＋入庫 / −出庫）です。" />
      <FilterBar basePath="/inventory/transactions">
        <FilterText label="商品" name="q" value={query} placeholder="商品名・SKU・JAN" />
        <FilterSelect label="区分" name="type" value={type} placeholder="すべて" options={TYPES.map((value) => ({ value, label: TRANSACTION_TYPE_LABELS[value] }))} />
        <FilterSelect label="拠点" name="location" value={locationId} placeholder="すべての拠点" options={activeLocationOptions(locations)} />
        <FilterText label="期間（開始）" name="from" type="date" value={from} />
        <FilterText label="期間（終了）" name="to" type="date" value={to} />
        {productId ? <input type="hidden" name="product" value={productId} /> : null}
        {referenceId ? <input type="hidden" name="reference" value={referenceId} /> : null}
      </FilterBar>

      <Card className="mt-4">
        {rows.length === 0 ? (
          <EmptyState icon={History} title="条件に一致する履歴はありません" />
        ) : (
          <>
            <TableContainer caption="入出庫履歴">
              <thead>
                <tr>
                  <th scope="col" className={th}>日時</th>
                  <th scope="col" className={th}>区分</th>
                  <th scope="col" className={th}>商品</th>
                  <th scope="col" className={th}>拠点</th>
                  <th scope="col" className={th}>ロット</th>
                  <th scope="col" className={thRight}>数量</th>
                  <th scope="col" className={thRight}>処理前 → 後</th>
                  <th scope="col" className={thRight}>単価</th>
                  <th scope="col" className={th}>理由・参照</th>
                  <th scope="col" className={th}>担当</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((t) => {
                  const referenceHref = t.reference_type && t.reference_id ? REFERENCE_LINKS[t.reference_type]?.(t.reference_id) : undefined;
                  return (
                    <tr key={t.id} className={tr}>
                      <td className={`${td} text-xs whitespace-nowrap`}>{formatDateTime(t.created_at)}</td>
                      <td className={td}>
                        <Badge tone={TRANSACTION_TYPE_TONES[t.transaction_type] ?? "neutral"}>{label(TRANSACTION_TYPE_LABELS, t.transaction_type)}</Badge>
                      </td>
                      <td className={`${td} min-w-56`}>
                        <Link href={`/products/${t.products.id}`} className="hover:underline">
                          {t.products.product_name}
                        </Link>
                        <p className="font-mono text-xs text-slate-500">{t.products.sku}</p>
                      </td>
                      <td className={`${td} whitespace-nowrap`}>{t.locations?.name}</td>
                      <td className={`${td} font-mono text-xs whitespace-nowrap`}>{t.inventory_lots?.lot_number ?? "—"}</td>
                      <td className={`${tdRight} font-semibold ${t.quantity < 0 ? "text-slate-900" : "text-emerald-800"}`}>
                        {t.quantity > 0 ? "+" : ""}
                        {formatQuantity(t.quantity, t.products.sales_unit)}
                      </td>
                      <td className={tdRight}>
                        {formatQuantity(t.before_quantity)} → {formatQuantity(t.after_quantity)}
                      </td>
                      <td className={tdRight}>{t.unit_cost === null ? "—" : formatCurrency(t.unit_cost, true)}</td>
                      <td className={`${td} text-xs text-slate-600`}>
                        {t.reason ?? "—"}
                        {referenceHref ? (
                          <p>
                            <Link href={referenceHref} className="text-emerald-800 hover:underline">
                              元伝票を見る
                            </Link>
                          </p>
                        ) : null}
                      </td>
                      <td className={`${td} text-xs whitespace-nowrap`}>{t.profiles?.display_name ?? "システム"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </TableContainer>
            <Pagination
              basePath="/inventory/transactions"
              params={{ q: query, type, location: locationId, product: productId, reference: referenceId, from, to }}
              page={page}
              total={total}
            />
          </>
        )}
      </Card>
    </>
  );
}
