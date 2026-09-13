import type { Metadata } from "next";
import { PackageMinus } from "lucide-react";
import Link from "next/link";

import { ButtonLink } from "@/components/ui/button";
import { FilterBar, FilterSelect, FilterText } from "@/components/ui/filter-bar";
import { Pagination, PAGE_SIZE, parsePage } from "@/components/ui/pagination";
import { Badge, Card, EmptyState, PageHeader, TableContainer, td, tdRight, th, thRight, tr } from "@/components/ui/primitives";
import { requireOrgContext } from "@/lib/auth/context";
import { activeLocationOptions, getLocations } from "@/lib/data/lookups";
import { hasPermission } from "@/lib/domain/permissions";
import { logDbError } from "@/lib/errors";
import { formatDateTime, formatQuantity } from "@/lib/format";
import { ISSUE_TYPE_LABELS, label } from "@/lib/labels";
import { dateParam, enumParam, uuidParam } from "@/lib/search-params";

export const metadata: Metadata = { title: "出庫・移動" };

const TYPES = ["sale", "usage", "transfer"] as const;

export default async function IssuesPage({ searchParams }: PageProps<"/issues">) {
  const params = await searchParams;
  const context = await requireOrgContext();
  const { supabase, organization } = context;
  const locationId = uuidParam(params, "location");
  const type = enumParam(params, "type", TYPES);
  const from = dateParam(params, "from");
  const to = dateParam(params, "to");
  const page = parsePage(params.page);

  let request = supabase
    .from("stock_issues")
    .select(
      "id, issue_number, issue_type, total_quantity, notes, created_at, source:locations!stock_issues_organization_id_location_id_fkey(name), destination:locations!stock_issues_organization_id_destination_location_id_fkey(name), profiles(display_name)",
      { count: "exact" },
    )
    .eq("organization_id", organization.id)
    .order("created_at", { ascending: false })
    .range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1);
  if (locationId) request = request.or(`location_id.eq.${locationId},destination_location_id.eq.${locationId}`);
  if (type) request = request.eq("issue_type", type);
  if (from) request = request.gte("created_at", `${from}T00:00:00+09:00`);
  if (to) request = request.lte("created_at", `${to}T23:59:59.999+09:00`);

  const [locations, result] = await Promise.all([getLocations(supabase, organization.id), request]);
  if (result.error) {
    logDbError("issues list", result.error);
    throw new Error("出庫伝票の読み込みに失敗しました。");
  }
  const canIssue = hasPermission(context.role, "inventory.issue") && !organization.isDemoReadonly;

  return (
    <>
      <PageHeader
        title="出庫・移動"
        description="販売・使用による出庫と拠点間移動の伝票。明細（ロット別）は伝票番号から確認できます。"
        actions={
          canIssue ? (
            <ButtonLink href="/issues/new">
              <PackageMinus className="size-4" aria-hidden="true" />
              出庫・移動を登録
            </ButtonLink>
          ) : null
        }
      />
      <FilterBar basePath="/issues">
        <FilterSelect label="区分" name="type" value={type} placeholder="すべて" options={TYPES.map((value) => ({ value, label: ISSUE_TYPE_LABELS[value] }))} />
        <FilterSelect label="拠点（移動元・移動先）" name="location" value={locationId} placeholder="すべての拠点" options={activeLocationOptions(locations)} />
        <FilterText label="期間（開始）" name="from" type="date" value={from} />
        <FilterText label="期間（終了）" name="to" type="date" value={to} />
      </FilterBar>
      <Card className="mt-4">
        {result.data.length === 0 ? (
          <EmptyState
            icon={PackageMinus}
            title="出庫伝票はありません"
            action={canIssue ? <ButtonLink href="/issues/new" variant="secondary">出庫・移動を登録</ButtonLink> : null}
          />
        ) : (
          <>
            <TableContainer caption="出庫伝票一覧">
              <thead>
                <tr>
                  <th scope="col" className={th}>日時</th>
                  <th scope="col" className={th}>出庫番号</th>
                  <th scope="col" className={th}>区分</th>
                  <th scope="col" className={th}>出庫元 → 移動先</th>
                  <th scope="col" className={thRight}>数量</th>
                  <th scope="col" className={th}>備考</th>
                  <th scope="col" className={th}>担当</th>
                </tr>
              </thead>
              <tbody>
                {result.data.map((issue) => (
                  <tr key={issue.id} className={tr}>
                    <td className={`${td} text-xs whitespace-nowrap`}>{formatDateTime(issue.created_at)}</td>
                    <td className={`${td} whitespace-nowrap`}>
                      <Link href={`/inventory/transactions?reference=${issue.id}`} className="font-medium hover:underline">
                        {issue.issue_number}
                      </Link>
                    </td>
                    <td className={td}>
                      <Badge tone={issue.issue_type === "transfer" ? "info" : "neutral"} icon={false}>
                        {label(ISSUE_TYPE_LABELS, issue.issue_type)}
                      </Badge>
                    </td>
                    <td className={`${td} whitespace-nowrap`}>
                      {issue.source?.name}
                      {issue.destination ? ` → ${issue.destination.name}` : ""}
                    </td>
                    <td className={tdRight}>{formatQuantity(issue.total_quantity)}</td>
                    <td className={`${td} text-xs text-slate-600`}>{issue.notes ?? "—"}</td>
                    <td className={`${td} text-xs whitespace-nowrap`}>{issue.profiles?.display_name ?? "システム"}</td>
                  </tr>
                ))}
              </tbody>
            </TableContainer>
            <Pagination basePath="/issues" params={{ type, location: locationId, from, to }} page={page} total={result.count ?? 0} />
          </>
        )}
      </Card>
    </>
  );
}
