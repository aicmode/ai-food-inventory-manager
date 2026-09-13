import type { Metadata } from "next";
import { PackageSearch, Plus } from "lucide-react";
import Link from "next/link";

import { ButtonLink } from "@/components/ui/button";
import { FilterBar, FilterSelect, FilterText } from "@/components/ui/filter-bar";
import { Pagination, PAGE_SIZE, parsePage } from "@/components/ui/pagination";
import { Badge, Card, EmptyState, PageHeader, TableContainer, td, tdRight, th, thRight, tr } from "@/components/ui/primitives";
import { requireOrgContext } from "@/lib/auth/context";
import { activeLocationOptions, categoryFilterOptions, getCategories, getLocations, getSuppliers } from "@/lib/data/lookups";
import { hasPermission } from "@/lib/domain/permissions";
import { logDbError } from "@/lib/errors";
import { formatCurrency, formatQuantity, normalizeSearchQuery } from "@/lib/format";
import { STOCK_STATUS_LABELS, STOCK_STATUS_TONES, STORAGE_TYPE_LABELS, label } from "@/lib/labels";
import { enumParam, textParam, uuidParam } from "@/lib/search-params";

export const metadata: Metadata = { title: "商品" };

const STORAGE = ["room_temperature", "refrigerated", "frozen"] as const;
const STOCK = ["out_of_stock", "low", "normal", "overstock"] as const;
const ACTIVE = ["active", "inactive", "all"] as const;
const SORTS = ["sku", "name", "stock_asc", "stock_desc", "updated"] as const;

export default async function ProductsPage({ searchParams }: PageProps<"/products">) {
  const params = await searchParams;
  const context = await requireOrgContext();
  const { supabase, organization } = context;

  const query = textParam(params, "q");
  const categoryId = uuidParam(params, "category");
  const storage = enumParam(params, "storage", STORAGE);
  const supplierId = uuidParam(params, "supplier");
  const stock = enumParam(params, "stock", STOCK);
  const active = enumParam(params, "active", ACTIVE) ?? "active";
  const locationId = uuidParam(params, "location");
  const sort = enumParam(params, "sort", SORTS) ?? "sku";
  const page = parsePage(params.page);
  const normalized = query ? normalizeSearchQuery(query) : null;

  const [categories, suppliers, locations, result] = await Promise.all([
    getCategories(supabase, organization.id),
    getSuppliers(supabase, organization.id),
    getLocations(supabase, organization.id),
    supabase.rpc("search_products", {
      p_organization_id: organization.id,
      p_query: normalized?.primary,
      p_query_alt: normalized?.kana ?? undefined,
      p_category_id: categoryId,
      p_storage_type: storage,
      p_supplier_id: supplierId,
      p_stock_status: stock,
      p_is_active: active === "all" ? undefined : active === "active",
      p_location_id: locationId,
      p_sort: sort,
      p_limit: PAGE_SIZE,
      p_offset: (page - 1) * PAGE_SIZE,
    }),
  ]);
  if (result.error) {
    logDbError("search_products", result.error);
    throw new Error("商品の検索に失敗しました。");
  }
  const rows = result.data;
  const total = rows[0]?.total_count ?? 0;
  const canManage = hasPermission(context.role, "master.manage") && !organization.isDemoReadonly;
  const filterParams = { q: query, category: categoryId, storage, supplier: supplierId, stock, active, location: locationId, sort };

  return (
    <>
      <PageHeader
        title="商品"
        description="商品マスタの検索・登録。在庫状態は選択した拠点（未選択時は全拠点合計）の利用可能在庫と直近30日の出庫から判定します。"
        actions={
          canManage ? (
            <ButtonLink href="/products/new">
              <Plus className="size-4" aria-hidden="true" />
              商品を登録
            </ButtonLink>
          ) : null
        }
      />

      <FilterBar basePath="/products">
        <FilterText label="キーワード" name="q" value={query} placeholder="商品名・カナ・SKU・JAN・メーカー・仕入先" />
        <FilterSelect label="カテゴリ" name="category" value={categoryId} placeholder="すべて" options={categoryFilterOptions(categories)} />
        <FilterSelect
          label="保存区分"
          name="storage"
          value={storage}
          placeholder="すべて"
          options={STORAGE.map((value) => ({ value, label: STORAGE_TYPE_LABELS[value] }))}
        />
        <FilterSelect label="仕入先" name="supplier" value={supplierId} placeholder="すべて" options={suppliers.map((s) => ({ value: s.id, label: s.company_name }))} />
        <FilterSelect label="在庫状態" name="stock" value={stock} placeholder="すべて" options={STOCK.map((value) => ({ value, label: STOCK_STATUS_LABELS[value] }))} />
        <FilterSelect
          label="商品状態"
          name="active"
          value={active}
          options={[
            { value: "active", label: "有効のみ" },
            { value: "inactive", label: "無効のみ" },
            { value: "all", label: "すべて" },
          ]}
        />
        <FilterSelect label="在庫の拠点" name="location" value={locationId} placeholder="全拠点合計" options={activeLocationOptions(locations)} />
        <FilterSelect
          label="並び順"
          name="sort"
          value={sort}
          options={[
            { value: "sku", label: "SKU順" },
            { value: "name", label: "商品名順" },
            { value: "stock_asc", label: "在庫の少ない順" },
            { value: "stock_desc", label: "在庫の多い順" },
            { value: "updated", label: "更新日の新しい順" },
          ]}
        />
      </FilterBar>

      <Card className="mt-4">
        {rows.length === 0 ? (
          <EmptyState
            icon={PackageSearch}
            title="条件に一致する商品はありません"
            description="キーワードや絞り込み条件を変更してください。"
            action={canManage ? <ButtonLink href="/products/new" variant="secondary">商品を登録</ButtonLink> : null}
          />
        ) : (
          <>
            <div className="hidden md:block">
              <TableContainer caption="商品一覧">
                <thead>
                  <tr>
                    <th scope="col" className={th}>SKU / JAN</th>
                    <th scope="col" className={th}>商品名</th>
                    <th scope="col" className={th}>カテゴリ</th>
                    <th scope="col" className={th}>保存</th>
                    <th scope="col" className={th}>主要仕入先</th>
                    <th scope="col" className={thRight}>原価 / 売価</th>
                    <th scope="col" className={thRight}>利用可能在庫</th>
                    <th scope="col" className={thRight}>日平均出庫</th>
                    <th scope="col" className={th}>在庫状態</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((p) => (
                    <tr key={p.id} className={tr}>
                      <td className={`${td} whitespace-nowrap`}>
                        <span className="font-mono text-xs">{p.sku}</span>
                        <p className="font-mono text-xs text-slate-500">{p.jan_code ?? "—"}</p>
                      </td>
                      <td className={`${td} min-w-64`}>
                        <Link href={`/products/${p.id}`} className="font-medium text-slate-900 hover:underline">
                          {p.product_name}
                        </Link>
                        <p className="text-xs text-slate-500">
                          {[p.manufacturer, p.brand].filter(Boolean).join(" / ") || "—"}
                          {!p.is_active ? "・無効" : ""}
                        </p>
                      </td>
                      <td className={`${td} text-xs whitespace-nowrap`}>
                        {p.category_name ?? "未分類"}
                        {p.subcategory_name ? <p className="text-slate-500">{p.subcategory_name}</p> : null}
                      </td>
                      <td className={td}>
                        <Badge tone="neutral" icon={false}>
                          {label(STORAGE_TYPE_LABELS, p.storage_type)}
                        </Badge>
                      </td>
                      <td className={`${td} text-xs`}>{p.supplier_name ?? "未設定"}</td>
                      <td className={tdRight}>
                        {formatCurrency(p.cost_price, true)}
                        <p className="text-xs text-slate-500">{formatCurrency(p.selling_price)}</p>
                      </td>
                      <td className={tdRight}>{formatQuantity(p.quantity_available, p.sales_unit)}</td>
                      <td className={tdRight}>{formatQuantity(p.avg_daily_usage)}</td>
                      <td className={td}>
                        <Badge tone={STOCK_STATUS_TONES[p.stock_status] ?? "neutral"}>{label(STOCK_STATUS_LABELS, p.stock_status)}</Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </TableContainer>
            </div>
            <ul className="divide-y divide-slate-100 md:hidden" aria-label="商品一覧">
              {rows.map((p) => (
                <li key={p.id}>
                  <Link href={`/products/${p.id}`} className="block px-4 py-3 hover:bg-slate-50">
                    <div className="flex items-start justify-between gap-2">
                      <p className="font-medium text-slate-900">{p.product_name}</p>
                      <Badge tone={STOCK_STATUS_TONES[p.stock_status] ?? "neutral"}>{label(STOCK_STATUS_LABELS, p.stock_status)}</Badge>
                    </div>
                    <p className="mt-0.5 font-mono text-xs text-slate-500">{p.sku}</p>
                    <p className="mt-1 text-xs text-slate-600">
                      {p.category_name ?? "未分類"}・{label(STORAGE_TYPE_LABELS, p.storage_type)}・在庫 {formatQuantity(p.quantity_available, p.sales_unit)}
                    </p>
                  </Link>
                </li>
              ))}
            </ul>
            <Pagination basePath="/products" params={filterParams} page={page} total={Number(total)} />
          </>
        )}
      </Card>
    </>
  );
}
