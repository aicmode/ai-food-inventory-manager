import type { Metadata } from "next";
import { Plus, ShoppingCart, Sparkles } from "lucide-react";
import Link from "next/link";

import { ButtonLink } from "@/components/ui/button";
import { FilterBar, FilterSelect, FilterText } from "@/components/ui/filter-bar";
import { Pagination, PAGE_SIZE, parsePage } from "@/components/ui/pagination";
import { Badge, Card, EmptyState, PageHeader, TableContainer, td, tdRight, th, thRight, tr } from "@/components/ui/primitives";
import { requireOrgContext } from "@/lib/auth/context";
import { activeLocationOptions, getLocations, getSuppliers } from "@/lib/data/lookups";
import { hasPermission } from "@/lib/domain/permissions";
import { logDbError } from "@/lib/errors";
import { formatCurrency, formatDate, todayJst } from "@/lib/format";
import { PO_STATUS_LABELS, PO_STATUS_TONES, label } from "@/lib/labels";
import { dateParam, enumParam, sanitizeFilterText, textParam, uuidParam } from "@/lib/search-params";

export const metadata: Metadata = { title: "発注" };

const STATUS = ["open", "draft", "ordered", "partially_received", "received", "cancelled"] as const;

export default async function PurchaseOrdersPage({ searchParams }: PageProps<"/purchase-orders">) {
  const params = await searchParams;
  const context = await requireOrgContext();
  const { supabase, organization } = context;
  const status = enumParam(params, "status", STATUS);
  const supplierId = uuidParam(params, "supplier");
  const locationId = uuidParam(params, "location");
  const query = textParam(params, "q");
  const from = dateParam(params, "from");
  const to = dateParam(params, "to");
  const page = parsePage(params.page);

  let request = supabase
    .from("purchase_orders")
    .select("id, order_number, status, order_date, expected_delivery_date, total_amount, notes, suppliers(company_name), locations(name), purchase_order_items(count)", { count: "exact" })
    .eq("organization_id", organization.id)
    .order("order_date", { ascending: false })
    .order("order_number", { ascending: false })
    .range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1);
  if (status === "open") request = request.in("status", ["draft", "ordered", "partially_received"]);
  else if (status) request = request.eq("status", status);
  if (supplierId) request = request.eq("supplier_id", supplierId);
  if (locationId) request = request.eq("location_id", locationId);
  if (from) request = request.gte("order_date", from);
  if (to) request = request.lte("order_date", to);
  if (query) {
    const text = sanitizeFilterText(query.normalize("NFKC"));
    if (text) request = request.ilike("order_number", `%${text}%`);
  }

  const [suppliers, locations, result] = await Promise.all([getSuppliers(supabase, organization.id), getLocations(supabase, organization.id), request]);
  if (result.error) {
    logDbError("purchase orders list", result.error);
    throw new Error("発注書の読み込みに失敗しました。");
  }
  const canManage = hasPermission(context.role, "purchase.manage") && !organization.isDemoReadonly;
  const today = todayJst();

  return (
    <>
      <PageHeader
        title="発注"
        description="発注書は仕入先ごとに作成されます。入荷時は「入庫登録」で発注残と状態が更新されます。"
        actions={
          canManage ? (
            <>
              <ButtonLink href="/ai-orders" variant="secondary">
                <Sparkles className="size-4" aria-hidden="true" />
                AI発注提案から作成
              </ButtonLink>
              <ButtonLink href="/purchase-orders/new">
                <Plus className="size-4" aria-hidden="true" />
                発注書を作成
              </ButtonLink>
            </>
          ) : null
        }
      />
      <FilterBar basePath="/purchase-orders">
        <FilterText label="発注番号" name="q" value={query} placeholder="PO-202609-" />
        <FilterSelect
          label="状態"
          name="status"
          value={status}
          placeholder="すべて"
          options={STATUS.map((value) => ({ value, label: value === "open" ? "未完了（下書き・発注済・一部入荷）" : PO_STATUS_LABELS[value] }))}
        />
        <FilterSelect label="仕入先" name="supplier" value={supplierId} placeholder="すべて" options={suppliers.map((s) => ({ value: s.id, label: s.company_name }))} />
        <FilterSelect label="納品先" name="location" value={locationId} placeholder="すべての拠点" options={activeLocationOptions(locations)} />
        <FilterText label="発注日（開始）" name="from" type="date" value={from} />
        <FilterText label="発注日（終了）" name="to" type="date" value={to} />
      </FilterBar>
      <Card className="mt-4">
        {result.data.length === 0 ? (
          <EmptyState icon={ShoppingCart} title="条件に一致する発注書はありません" />
        ) : (
          <>
            <TableContainer caption="発注書一覧">
              <thead>
                <tr>
                  <th scope="col" className={th}>発注番号</th>
                  <th scope="col" className={th}>発注日</th>
                  <th scope="col" className={th}>仕入先</th>
                  <th scope="col" className={th}>納品先</th>
                  <th scope="col" className={th}>納品予定</th>
                  <th scope="col" className={thRight}>明細</th>
                  <th scope="col" className={thRight}>合計（税込）</th>
                  <th scope="col" className={th}>状態</th>
                </tr>
              </thead>
              <tbody>
                {result.data.map((po) => {
                  const late = (po.status === "ordered" || po.status === "partially_received") && po.expected_delivery_date !== null && po.expected_delivery_date < today;
                  return (
                    <tr key={po.id} className={tr}>
                      <td className={`${td} whitespace-nowrap`}>
                        <Link href={`/purchase-orders/${po.id}`} className="font-medium hover:underline">
                          {po.order_number}
                        </Link>
                      </td>
                      <td className={`${td} whitespace-nowrap`}>{formatDate(po.order_date)}</td>
                      <td className={td}>{po.suppliers?.company_name}</td>
                      <td className={`${td} whitespace-nowrap`}>{po.locations?.name}</td>
                      <td className={`${td} whitespace-nowrap`}>
                        {formatDate(po.expected_delivery_date)}
                        {late ? <p className="text-xs font-medium text-red-700">納期超過</p> : null}
                      </td>
                      <td className={tdRight}>{po.purchase_order_items[0]?.count ?? 0}</td>
                      <td className={tdRight}>{formatCurrency(po.total_amount)}</td>
                      <td className={td}>
                        <Badge tone={PO_STATUS_TONES[po.status] ?? "neutral"}>{label(PO_STATUS_LABELS, po.status)}</Badge>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </TableContainer>
            <Pagination basePath="/purchase-orders" params={{ q: query, status, supplier: supplierId, location: locationId, from, to }} page={page} total={result.count ?? 0} />
          </>
        )}
      </Card>
    </>
  );
}
