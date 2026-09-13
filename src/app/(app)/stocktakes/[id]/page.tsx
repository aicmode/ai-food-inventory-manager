import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { FilterBar, FilterSelect, FilterText } from "@/components/ui/filter-bar";
import { Pagination, PAGE_SIZE, parsePage } from "@/components/ui/pagination";
import { Badge, Card, CardBody, DetailList, EmptyState, PageHeader, StatTile, TableContainer, td, tdRight, th, thRight, tr } from "@/components/ui/primitives";
import { requireOrgContext } from "@/lib/auth/context";
import { hasPermission } from "@/lib/domain/permissions";
import { logDbError } from "@/lib/errors";
import { formatDateTime, formatQuantity, normalizeSearchQuery } from "@/lib/format";
import { STOCKTAKE_STATUS_LABELS, STOCKTAKE_STATUS_TONES, label } from "@/lib/labels";
import { enumParam, isUuid, textParam } from "@/lib/search-params";

import { StocktakeCountForm, StocktakeStatusActions } from "../stocktake-forms";

export const metadata: Metadata = { title: "棚卸詳細" };

const VIEWS = ["all", "uncounted", "difference"] as const;

export default async function StocktakeDetailPage({ params, searchParams }: PageProps<"/stocktakes/[id]">) {
  const { id } = await params;
  if (!isUuid(id)) notFound();
  const query = await searchParams;
  const context = await requireOrgContext();
  const { supabase, organization } = context;

  const [stocktakeResult, itemsResult] = await Promise.all([
    supabase
      .from("stocktakes")
      .select("id, stocktake_number, status, notes, started_at, completed_at, locations(name), categories(name), creator:profiles!stocktakes_created_by_fkey(display_name), completer:profiles!stocktakes_completed_by_fkey(display_name)")
      .eq("id", id)
      .eq("organization_id", organization.id)
      .maybeSingle(),
    supabase
      .from("stocktake_items")
      .select("id, expected_quantity, actual_quantity, difference_quantity, adjusted_quantity, reason, products(sku, product_name, product_name_kana, jan_code, sales_unit, storage_location_note, cost_price)")
      .eq("stocktake_id", id)
      .eq("organization_id", organization.id)
      .limit(5000),
  ]);
  if (stocktakeResult.error || itemsResult.error) {
    logDbError("stocktake detail", stocktakeResult.error ?? itemsResult.error);
    throw new Error("棚卸の読み込みに失敗しました。");
  }
  const stocktake = stocktakeResult.data;
  if (!stocktake) notFound();

  const view = enumParam(query, "view", VIEWS) ?? "all";
  const q = textParam(query, "q");
  const page = parsePage(query.page);
  const normalized = q ? normalizeSearchQuery(q) : null;

  const items = [...itemsResult.data].sort((a, b) => (a.products?.sku ?? "").localeCompare(b.products?.sku ?? ""));
  const counted = items.filter((i) => i.actual_quantity !== null);
  const differences = counted.filter((i) => (i.difference_quantity ?? 0) !== 0);
  const differenceValue = differences.reduce((sum, i) => sum + (i.difference_quantity ?? 0) * (i.products?.cost_price ?? 0), 0);

  const filtered = items.filter((item) => {
    if (view === "uncounted" && item.actual_quantity !== null) return false;
    if (view === "difference" && (item.actual_quantity === null || item.difference_quantity === 0)) return false;
    if (normalized) {
      const haystack = `${item.products?.sku} ${item.products?.jan_code ?? ""} ${item.products?.product_name} ${item.products?.product_name_kana ?? ""}`.toLowerCase();
      if (!haystack.includes(normalized.primary.toLowerCase()) && !(normalized.kana && haystack.includes(normalized.kana.toLowerCase()))) return false;
    }
    return true;
  });
  const pageItems = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const inProgress = stocktake.status === "in_progress";
  const canCount = inProgress && hasPermission(context.role, "stocktake.count") && !organization.isDemoReadonly;
  const canManage = inProgress && hasPermission(context.role, "stocktake.manage") && !organization.isDemoReadonly;

  return (
    <>
      <PageHeader
        title={`棚卸 ${stocktake.stocktake_number}`}
        description={
          <span className="flex flex-wrap items-center gap-2">
            {stocktake.locations?.name}・{stocktake.categories?.name ?? "全カテゴリ"}
            <Badge tone={STOCKTAKE_STATUS_TONES[stocktake.status] ?? "neutral"}>{label(STOCKTAKE_STATUS_LABELS, stocktake.status)}</Badge>
          </span>
        }
        breadcrumbs={[{ href: "/stocktakes", label: "棚卸" }]}
        actions={
          canManage ? (
            <StocktakeStatusActions stocktakeId={stocktake.id} countedCount={counted.length} totalCount={items.length} differenceCount={differences.length} />
          ) : null
        }
      />

      <section aria-label="棚卸の進捗" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile label="カウント進捗" value={`${counted.length.toLocaleString("ja-JP")} / ${items.length.toLocaleString("ja-JP")}`} sub={`${items.length ? Math.round((counted.length / items.length) * 100) : 0}% 完了`} />
        <StatTile label="差異あり" value={`${differences.length.toLocaleString("ja-JP")} 品目`} tone={differences.length > 0 ? "warning" : "success"} />
        <StatTile label="差異金額（原価）" value={new Intl.NumberFormat("ja-JP", { style: "currency", currency: "JPY", maximumFractionDigits: 0 }).format(differenceValue)} />
        <StatTile label="未カウント" value={`${(items.length - counted.length).toLocaleString("ja-JP")} 品目`} />
      </section>

      <Card className="mt-4">
        <CardBody>
          <DetailList
            columns={3}
            items={[
              { label: "開始", value: `${formatDateTime(stocktake.started_at)}（${stocktake.creator?.display_name ?? "システム"}）` },
              { label: stocktake.status === "cancelled" ? "中止" : "確定", value: stocktake.completed_at ? `${formatDateTime(stocktake.completed_at)}（${stocktake.completer?.display_name ?? "システム"}）` : "—" },
              { label: "備考", value: stocktake.notes },
            ]}
          />
        </CardBody>
      </Card>

      <div className="mt-4">
        <FilterBar basePath={`/stocktakes/${stocktake.id}`}>
          <FilterText label="商品" name="q" value={q} placeholder="商品名・SKU・JAN" />
          <FilterSelect
            label="表示"
            name="view"
            value={view}
            options={[
              { value: "all", label: "すべて" },
              { value: "uncounted", label: "未カウントのみ" },
              { value: "difference", label: "差異ありのみ" },
            ]}
          />
        </FilterBar>
      </div>

      <Card className="mt-4">
        {pageItems.length === 0 ? (
          <EmptyState title="条件に一致する品目はありません" />
        ) : inProgress ? (
          <>
            <StocktakeCountForm
              key={`${page}-${view}-${q ?? ""}`}
              stocktakeId={stocktake.id}
              canCount={canCount}
              rows={pageItems.map((item) => ({
                id: item.id,
                sku: item.products?.sku ?? "",
                productName: item.products?.product_name ?? "",
                unit: item.products?.sales_unit ?? "",
                storageNote: item.products?.storage_location_note ?? null,
                expected: item.expected_quantity,
                actual: item.actual_quantity,
                reason: item.reason,
              }))}
            />
            <Pagination basePath={`/stocktakes/${stocktake.id}`} params={{ q, view }} page={page} total={filtered.length} />
          </>
        ) : (
          <>
            <TableContainer caption="棚卸結果">
              <thead>
                <tr>
                  <th scope="col" className={th}>商品</th>
                  <th scope="col" className={thRight}>理論在庫</th>
                  <th scope="col" className={thRight}>実数</th>
                  <th scope="col" className={thRight}>差異</th>
                  <th scope="col" className={thRight}>在庫反映</th>
                  <th scope="col" className={th}>理由</th>
                </tr>
              </thead>
              <tbody>
                {pageItems.map((item) => (
                  <tr key={item.id} className={tr}>
                    <td className={`${td} min-w-56`}>
                      {item.products?.product_name}
                      <p className="font-mono text-xs text-slate-500">{item.products?.sku}</p>
                    </td>
                    <td className={tdRight}>{formatQuantity(item.expected_quantity, item.products?.sales_unit)}</td>
                    <td className={tdRight}>{item.actual_quantity === null ? "未カウント" : formatQuantity(item.actual_quantity)}</td>
                    <td className={`${tdRight} ${item.difference_quantity ? "font-semibold text-red-700" : ""}`}>
                      {item.difference_quantity === null ? "—" : `${item.difference_quantity > 0 ? "+" : ""}${formatQuantity(item.difference_quantity)}`}
                    </td>
                    <td className={tdRight}>{item.adjusted_quantity === null ? "—" : `${item.adjusted_quantity > 0 ? "+" : ""}${formatQuantity(item.adjusted_quantity)}`}</td>
                    <td className={`${td} text-xs text-slate-600`}>{item.reason ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </TableContainer>
            <Pagination basePath={`/stocktakes/${stocktake.id}`} params={{ q, view }} page={page} total={filtered.length} />
          </>
        )}
      </Card>
      {stocktake.status === "completed" ? (
        <p className="mt-3 text-xs text-slate-500">
          在庫への反映内容は{" "}
          <Link href={`/inventory/transactions?reference=${stocktake.id}`} className="text-emerald-800 hover:underline">
            入出庫履歴（棚卸差異）
          </Link>{" "}
          で確認できます。
        </p>
      ) : null}
    </>
  );
}
