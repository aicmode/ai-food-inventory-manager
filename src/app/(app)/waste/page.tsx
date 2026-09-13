import type { Metadata } from "next";
import { Percent, Trash2, Wallet } from "lucide-react";
import Link from "next/link";

import { BarList } from "@/components/charts/charts";
import { ButtonLink } from "@/components/ui/button";
import { FilterBar, FilterSelect, FilterText } from "@/components/ui/filter-bar";
import { Pagination, PAGE_SIZE, parsePage } from "@/components/ui/pagination";
import { Badge, Card, CardBody, CardHeader, EmptyState, PageHeader, StatTile, TableContainer, td, tdRight, th, thRight, tr } from "@/components/ui/primitives";
import { requireOrgContext } from "@/lib/auth/context";
import { loadDashboardSummary } from "@/lib/data/dashboard";
import { activeLocationOptions, getLocations } from "@/lib/data/lookups";
import { hasPermission } from "@/lib/domain/permissions";
import { logDbError } from "@/lib/errors";
import { formatCurrency, formatDate, formatPercent, formatQuantity } from "@/lib/format";
import { WASTE_REASON_LABELS, label } from "@/lib/labels";
import { dateParam, enumParam, uuidParam } from "@/lib/search-params";

export const metadata: Metadata = { title: "廃棄" };

const REASONS = ["expired", "damaged", "quality_issue", "overstock", "other"] as const;

export default async function WastePage({ searchParams }: PageProps<"/waste">) {
  const params = await searchParams;
  const context = await requireOrgContext();
  const { supabase, organization } = context;
  const locationId = uuidParam(params, "location");
  const reason = enumParam(params, "reason", REASONS);
  const from = dateParam(params, "from");
  const to = dateParam(params, "to");
  const page = parsePage(params.page);

  let request = supabase
    .from("waste_records")
    .select(
      "id, quantity, reason, cost_amount, waste_date, notes, created_at, locations(name), products(id, sku, product_name, sales_unit), inventory_lots(lot_number, expiration_date), profiles(display_name)",
      { count: "exact" },
    )
    .eq("organization_id", organization.id)
    .order("waste_date", { ascending: false })
    .order("created_at", { ascending: false })
    .range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1);
  if (locationId) request = request.eq("location_id", locationId);
  if (reason) request = request.eq("reason", reason);
  if (from) request = request.gte("waste_date", from);
  if (to) request = request.lte("waste_date", to);

  const [locations, summary, result] = await Promise.all([getLocations(supabase, organization.id), loadDashboardSummary(context), request]);
  if (result.error) {
    logDbError("waste list", result.error);
    throw new Error("廃棄記録の読み込みに失敗しました。");
  }
  const rate =
    summary.wasteMonthQuantity + summary.outboundMonthQuantity > 0
      ? summary.wasteMonthQuantity / (summary.wasteMonthQuantity + summary.outboundMonthQuantity)
      : 0;
  const canWaste = hasPermission(context.role, "inventory.waste") && !organization.isDemoReadonly;

  return (
    <>
      <PageHeader
        title="廃棄"
        description="食品ロスの記録と分析。廃棄率＝廃棄数量 ÷（販売・使用出庫＋廃棄数量）"
        actions={
          canWaste ? (
            <ButtonLink href="/waste/new" variant="danger">
              <Trash2 className="size-4" aria-hidden="true" />
              廃棄を登録
            </ButtonLink>
          ) : null
        }
      />
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3 lg:col-span-2 lg:grid-cols-3">
          <StatTile label="今月の廃棄数量" value={formatQuantity(summary.wasteMonthQuantity)} icon={Trash2} />
          <StatTile label="今月の廃棄金額" value={formatCurrency(summary.wasteMonthAmount)} sub="ロット原価ベース" icon={Wallet} />
          <StatTile label="今月の廃棄率" value={formatPercent(rate)} sub="数量ベース" icon={Percent} tone={rate >= 0.05 ? "warning" : "success"} />
        </div>
        <Card>
          <CardHeader title="今月の理由別廃棄金額" />
          <CardBody>
            {summary.wasteByReason.length === 0 ? (
              <p className="text-sm text-slate-500">今月の廃棄はありません。</p>
            ) : (
              <BarList
                title="理由別廃棄金額"
                items={summary.wasteByReason.map((r) => ({ label: label(WASTE_REASON_LABELS, r.reason), value: r.amount }))}
                valueFormat="currency"
                color="var(--series-2)"
              />
            )}
          </CardBody>
        </Card>
      </div>

      <div className="mt-4">
        <FilterBar basePath="/waste">
          <FilterSelect label="拠点" name="location" value={locationId} placeholder="すべての拠点" options={activeLocationOptions(locations)} />
          <FilterSelect label="理由" name="reason" value={reason} placeholder="すべて" options={REASONS.map((value) => ({ value, label: WASTE_REASON_LABELS[value] }))} />
          <FilterText label="廃棄日（開始）" name="from" type="date" value={from} />
          <FilterText label="廃棄日（終了）" name="to" type="date" value={to} />
        </FilterBar>
      </div>

      <Card className="mt-4">
        {result.data.length === 0 ? (
          <EmptyState icon={Trash2} title="廃棄記録はありません" />
        ) : (
          <>
            <TableContainer caption="廃棄記録一覧">
              <thead>
                <tr>
                  <th scope="col" className={th}>廃棄日</th>
                  <th scope="col" className={th}>商品</th>
                  <th scope="col" className={th}>拠点</th>
                  <th scope="col" className={th}>ロット / 期限</th>
                  <th scope="col" className={thRight}>数量</th>
                  <th scope="col" className={thRight}>金額</th>
                  <th scope="col" className={th}>理由</th>
                  <th scope="col" className={th}>備考・担当</th>
                </tr>
              </thead>
              <tbody>
                {result.data.map((w) => (
                  <tr key={w.id} className={tr}>
                    <td className={`${td} whitespace-nowrap`}>{formatDate(w.waste_date)}</td>
                    <td className={`${td} min-w-56`}>
                      <Link href={`/products/${w.products?.id}`} className="hover:underline">
                        {w.products?.product_name}
                      </Link>
                      <p className="font-mono text-xs text-slate-500">{w.products?.sku}</p>
                    </td>
                    <td className={`${td} whitespace-nowrap`}>{w.locations?.name}</td>
                    <td className={`${td} text-xs whitespace-nowrap`}>
                      <span className="font-mono">{w.inventory_lots?.lot_number ?? "—"}</span>
                      <p className="text-slate-500">{formatDate(w.inventory_lots?.expiration_date)}</p>
                    </td>
                    <td className={tdRight}>{formatQuantity(w.quantity, w.products?.sales_unit)}</td>
                    <td className={tdRight}>{formatCurrency(w.cost_amount)}</td>
                    <td className={td}>
                      <Badge tone={w.reason === "expired" ? "warning" : "danger"}>{label(WASTE_REASON_LABELS, w.reason)}</Badge>
                    </td>
                    <td className={`${td} text-xs text-slate-600`}>
                      {w.notes ?? "—"}
                      <p>{w.profiles?.display_name ?? "システム"}</p>
                    </td>
                  </tr>
                ))}
              </tbody>
            </TableContainer>
            <Pagination basePath="/waste" params={{ location: locationId, reason, from, to }} page={page} total={result.count ?? 0} />
          </>
        )}
      </Card>
    </>
  );
}
