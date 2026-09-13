import type { Metadata } from "next";
import { PackagePlus } from "lucide-react";
import Link from "next/link";

import { ButtonLink } from "@/components/ui/button";
import { FilterBar, FilterSelect, FilterText } from "@/components/ui/filter-bar";
import { Pagination, PAGE_SIZE, parsePage } from "@/components/ui/pagination";
import { Card, EmptyState, PageHeader, TableContainer, td, tdRight, th, thRight, tr } from "@/components/ui/primitives";
import { requireOrgContext } from "@/lib/auth/context";
import { activeLocationOptions, getLocations, getSuppliers } from "@/lib/data/lookups";
import { hasPermission } from "@/lib/domain/permissions";
import { logDbError } from "@/lib/errors";
import { formatCurrency, formatDate, formatDateTime, formatQuantity } from "@/lib/format";
import { dateParam, uuidParam } from "@/lib/search-params";

export const metadata: Metadata = { title: "入庫" };

export default async function ReceiptsPage({ searchParams }: PageProps<"/receipts">) {
  const params = await searchParams;
  const context = await requireOrgContext();
  const { supabase, organization } = context;
  const locationId = uuidParam(params, "location");
  const supplierId = uuidParam(params, "supplier");
  const from = dateParam(params, "from");
  const to = dateParam(params, "to");
  const page = parsePage(params.page);

  let request = supabase
    .from("receipts")
    .select(
      "id, receipt_number, received_date, total_quantity, total_amount, notes, created_at, locations(name), suppliers(company_name), purchase_orders(id, order_number), profiles(display_name)",
      { count: "exact" },
    )
    .eq("organization_id", organization.id)
    .order("received_date", { ascending: false })
    .order("created_at", { ascending: false })
    .range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1);
  if (locationId) request = request.eq("location_id", locationId);
  if (supplierId) request = request.eq("supplier_id", supplierId);
  if (from) request = request.gte("received_date", from);
  if (to) request = request.lte("received_date", to);

  const [locations, suppliers, result] = await Promise.all([getLocations(supabase, organization.id), getSuppliers(supabase, organization.id), request]);
  if (result.error) {
    logDbError("receipts list", result.error);
    throw new Error("入庫伝票の読み込みに失敗しました。");
  }
  const canReceive = hasPermission(context.role, "inventory.receive") && !organization.isDemoReadonly;

  return (
    <>
      <PageHeader
        title="入庫"
        description="仕入先からの入荷を記録します。発注書に紐づけると発注残と状態が自動更新されます。"
        actions={
          canReceive ? (
            <ButtonLink href="/receipts/new">
              <PackagePlus className="size-4" aria-hidden="true" />
              入庫を登録
            </ButtonLink>
          ) : null
        }
      />
      <FilterBar basePath="/receipts">
        <FilterSelect label="入庫先" name="location" value={locationId} placeholder="すべての拠点" options={activeLocationOptions(locations)} />
        <FilterSelect label="仕入先" name="supplier" value={supplierId} placeholder="すべて" options={suppliers.map((s) => ({ value: s.id, label: s.company_name }))} />
        <FilterText label="入庫日（開始）" name="from" type="date" value={from} />
        <FilterText label="入庫日（終了）" name="to" type="date" value={to} />
      </FilterBar>
      <Card className="mt-4">
        {result.data.length === 0 ? (
          <EmptyState
            icon={PackagePlus}
            title="入庫伝票はありません"
            action={canReceive ? <ButtonLink href="/receipts/new" variant="secondary">入庫を登録</ButtonLink> : null}
          />
        ) : (
          <>
            <TableContainer caption="入庫伝票一覧">
              <thead>
                <tr>
                  <th scope="col" className={th}>入庫日</th>
                  <th scope="col" className={th}>入庫番号</th>
                  <th scope="col" className={th}>入庫先</th>
                  <th scope="col" className={th}>仕入先</th>
                  <th scope="col" className={th}>発注書</th>
                  <th scope="col" className={thRight}>数量</th>
                  <th scope="col" className={thRight}>金額（税抜）</th>
                  <th scope="col" className={th}>登録</th>
                </tr>
              </thead>
              <tbody>
                {result.data.map((r) => (
                  <tr key={r.id} className={tr}>
                    <td className={`${td} whitespace-nowrap`}>{formatDate(r.received_date)}</td>
                    <td className={`${td} whitespace-nowrap`}>
                      <Link href={`/inventory/transactions?reference=${r.id}`} className="font-medium hover:underline">
                        {r.receipt_number}
                      </Link>
                    </td>
                    <td className={`${td} whitespace-nowrap`}>{r.locations?.name}</td>
                    <td className={td}>{r.suppliers?.company_name ?? "—"}</td>
                    <td className={`${td} whitespace-nowrap`}>
                      {r.purchase_orders ? (
                        <Link href={`/purchase-orders/${r.purchase_orders.id}`} className="hover:underline">
                          {r.purchase_orders.order_number}
                        </Link>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className={tdRight}>{formatQuantity(r.total_quantity)}</td>
                    <td className={tdRight}>{formatCurrency(r.total_amount)}</td>
                    <td className={`${td} text-xs whitespace-nowrap text-slate-600`}>
                      {r.profiles?.display_name ?? "システム"}
                      <p>{formatDateTime(r.created_at)}</p>
                    </td>
                  </tr>
                ))}
              </tbody>
            </TableContainer>
            <Pagination basePath="/receipts" params={{ location: locationId, supplier: supplierId, from, to }} page={page} total={result.count ?? 0} />
          </>
        )}
      </Card>
    </>
  );
}
