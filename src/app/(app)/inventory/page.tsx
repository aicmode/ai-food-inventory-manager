import type { Metadata } from "next";
import { Boxes, PackageMinus, PackagePlus } from "lucide-react";
import Link from "next/link";

import { ButtonLink } from "@/components/ui/button";
import { FilterBar, FilterSelect, FilterText } from "@/components/ui/filter-bar";
import { Pagination, PAGE_SIZE, parsePage } from "@/components/ui/pagination";
import { Badge, Card, EmptyState, PageHeader, TableContainer, td, tdRight, th, thRight, tr } from "@/components/ui/primitives";
import { requireOrgContext } from "@/lib/auth/context";
import { activeLocationOptions, categoryFilterOptions, getCategories, getLocations } from "@/lib/data/lookups";
import { hasPermission } from "@/lib/domain/permissions";
import { logDbError } from "@/lib/errors";
import { formatCurrency, formatDate, formatDateTime, formatQuantity, normalizeSearchQuery } from "@/lib/format";
import { STOCK_STATUS_LABELS, STOCK_STATUS_TONES, STORAGE_TYPE_LABELS, label } from "@/lib/labels";
import { enumParam, textParam, uuidParam } from "@/lib/search-params";

export const metadata: Metadata = { title: "在庫一覧" };

const STORAGE = ["room_temperature", "refrigerated", "frozen"] as const;
const STATUS = ["out_of_stock", "low", "normal", "overstock", "expiring", "expired"] as const;

export default async function InventoryPage({ searchParams }: PageProps<"/inventory">) {
  const params = await searchParams;
  const context = await requireOrgContext();
  const { supabase, organization } = context;
  const query = textParam(params, "q");
  const locationId = uuidParam(params, "location");
  const categoryId = uuidParam(params, "category");
  const storage = enumParam(params, "storage", STORAGE);
  const status = enumParam(params, "status", STATUS);
  const page = parsePage(params.page);
  const normalized = query ? normalizeSearchQuery(query) : null;

  const [locations, categories, result] = await Promise.all([
    getLocations(supabase, organization.id),
    getCategories(supabase, organization.id),
    supabase.rpc("search_inventory", {
      p_organization_id: organization.id,
      p_query: normalized?.primary,
      p_query_alt: normalized?.kana ?? undefined,
      p_location_id: locationId,
      p_category_id: categoryId,
      p_storage_type: storage,
      p_stock_status: status,
      p_limit: PAGE_SIZE,
      p_offset: (page - 1) * PAGE_SIZE,
    }),
  ]);
  if (result.error) {
    logDbError("search_inventory", result.error);
    throw new Error("在庫の検索に失敗しました。");
  }
  const rows = result.data;
  const total = Number(rows[0]?.total_count ?? 0);
  const filterParams = { q: query, location: locationId, category: categoryId, storage, status };

  return (
    <>
      <PageHeader
        title="在庫一覧"
        description="拠点×商品ごとの在庫。利用可能在庫＝現在庫−引当済。在庫数量はロット残数から自動集計されます。"
        actions={
          <>
            {hasPermission(context.role, "inventory.receive") ? (
              <ButtonLink href="/receipts/new" variant="secondary">
                <PackagePlus className="size-4" aria-hidden="true" />
                入庫
              </ButtonLink>
            ) : null}
            {hasPermission(context.role, "inventory.issue") ? (
              <ButtonLink href="/issues/new" variant="secondary">
                <PackageMinus className="size-4" aria-hidden="true" />
                出庫・移動
              </ButtonLink>
            ) : null}
          </>
        }
      />
      <FilterBar basePath="/inventory">
        <FilterText label="キーワード" name="q" value={query} placeholder="商品名・カナ・SKU・JAN" />
        <FilterSelect label="拠点" name="location" value={locationId} placeholder="すべての拠点" options={activeLocationOptions(locations)} />
        <FilterSelect label="カテゴリ" name="category" value={categoryId} placeholder="すべて" options={categoryFilterOptions(categories)} />
        <FilterSelect label="保存区分" name="storage" value={storage} placeholder="すべて" options={STORAGE.map((value) => ({ value, label: STORAGE_TYPE_LABELS[value] }))} />
        <FilterSelect label="在庫状態" name="status" value={status} placeholder="すべて" options={STATUS.map((value) => ({ value, label: STOCK_STATUS_LABELS[value] }))} />
      </FilterBar>

      <Card className="mt-4">
        {rows.length === 0 ? (
          <EmptyState icon={Boxes} title="条件に一致する在庫はありません" description="入庫すると在庫が表示されます。" />
        ) : (
          <>
            <div className="hidden md:block">
              <TableContainer caption="在庫一覧">
                <thead>
                  <tr>
                    <th scope="col" className={th}>商品</th>
                    <th scope="col" className={th}>拠点</th>
                    <th scope="col" className={th}>保存</th>
                    <th scope="col" className={thRight}>現在庫</th>
                    <th scope="col" className={thRight}>引当</th>
                    <th scope="col" className={thRight}>利用可能</th>
                    <th scope="col" className={thRight}>安全在庫 / 発注点</th>
                    <th scope="col" className={thRight}>在庫金額</th>
                    <th scope="col" className={th}>直近の賞味期限</th>
                    <th scope="col" className={th}>状態</th>
                    <th scope="col" className={th}>更新</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={`${r.location_id}-${r.product_id}`} className={tr}>
                      <td className={`${td} min-w-60`}>
                        <Link href={`/products/${r.product_id}`} className="font-medium hover:underline">
                          {r.product_name}
                        </Link>
                        <p className="font-mono text-xs text-slate-500">{r.sku}</p>
                      </td>
                      <td className={`${td} whitespace-nowrap`}>{r.location_name}</td>
                      <td className={`${td} whitespace-nowrap`}>{label(STORAGE_TYPE_LABELS, r.storage_type)}</td>
                      <td className={tdRight}>{formatQuantity(r.quantity_on_hand, r.sales_unit)}</td>
                      <td className={tdRight}>{formatQuantity(r.quantity_reserved)}</td>
                      <td className={`${tdRight} font-semibold`}>{formatQuantity(r.quantity_available)}</td>
                      <td className={tdRight}>
                        {formatQuantity(r.safety_stock)} / {formatQuantity(r.reorder_point)}
                      </td>
                      <td className={tdRight}>{formatCurrency(r.inventory_value)}</td>
                      <td className={`${td} whitespace-nowrap`}>
                        {formatDate(r.nearest_expiration_date)}
                        {r.expired_quantity > 0 ? <p className="text-xs text-red-700">期限切れ {formatQuantity(r.expired_quantity)}</p> : null}
                        {r.expiring_quantity > 0 ? <p className="text-xs text-amber-800">間近 {formatQuantity(r.expiring_quantity)}</p> : null}
                      </td>
                      <td className={td}>
                        <Badge tone={STOCK_STATUS_TONES[r.stock_status] ?? "neutral"}>{label(STOCK_STATUS_LABELS, r.stock_status)}</Badge>
                      </td>
                      <td className={`${td} text-xs whitespace-nowrap text-slate-500`}>{formatDateTime(r.updated_at)}</td>
                    </tr>
                  ))}
                </tbody>
              </TableContainer>
            </div>
            <ul className="divide-y divide-slate-100 md:hidden" aria-label="在庫一覧">
              {rows.map((r) => (
                <li key={`${r.location_id}-${r.product_id}`} className="px-4 py-3">
                  <div className="flex items-start justify-between gap-2">
                    <Link href={`/products/${r.product_id}`} className="font-medium text-slate-900">
                      {r.product_name}
                    </Link>
                    <Badge tone={STOCK_STATUS_TONES[r.stock_status] ?? "neutral"}>{label(STOCK_STATUS_LABELS, r.stock_status)}</Badge>
                  </div>
                  <p className="text-xs text-slate-500">
                    {r.sku}・{r.location_name}
                  </p>
                  <dl className="mt-2 grid grid-cols-3 gap-2 text-xs">
                    <div>
                      <dt className="text-slate-500">利用可能</dt>
                      <dd className="font-semibold tabular">{formatQuantity(r.quantity_available, r.sales_unit)}</dd>
                    </div>
                    <div>
                      <dt className="text-slate-500">発注点</dt>
                      <dd className="tabular">{formatQuantity(r.reorder_point)}</dd>
                    </div>
                    <div>
                      <dt className="text-slate-500">直近期限</dt>
                      <dd className="tabular">{formatDate(r.nearest_expiration_date)}</dd>
                    </div>
                  </dl>
                </li>
              ))}
            </ul>
            <Pagination basePath="/inventory" params={filterParams} page={page} total={total} />
          </>
        )}
      </Card>
    </>
  );
}
