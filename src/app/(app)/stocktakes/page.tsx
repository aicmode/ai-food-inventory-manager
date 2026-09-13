import type { Metadata } from "next";
import { ClipboardCheck } from "lucide-react";
import Link from "next/link";

import { ButtonLink } from "@/components/ui/button";
import { FilterBar, FilterSelect } from "@/components/ui/filter-bar";
import { Pagination, PAGE_SIZE, parsePage } from "@/components/ui/pagination";
import { Badge, Card, EmptyState, PageHeader, TableContainer, td, tdRight, th, thRight, tr } from "@/components/ui/primitives";
import { requireOrgContext } from "@/lib/auth/context";
import { activeLocationOptions, getLocations } from "@/lib/data/lookups";
import { hasPermission } from "@/lib/domain/permissions";
import { logDbError } from "@/lib/errors";
import { formatDateTime } from "@/lib/format";
import { STOCKTAKE_STATUS_LABELS, STOCKTAKE_STATUS_TONES, label } from "@/lib/labels";
import { enumParam, uuidParam } from "@/lib/search-params";

export const metadata: Metadata = { title: "棚卸" };

const STATUS = ["in_progress", "completed", "cancelled"] as const;

export default async function StocktakesPage({ searchParams }: PageProps<"/stocktakes">) {
  const params = await searchParams;
  const context = await requireOrgContext();
  const { supabase, organization } = context;
  const locationId = uuidParam(params, "location");
  const status = enumParam(params, "status", STATUS);
  const page = parsePage(params.page);

  let request = supabase
    .from("stocktakes")
    .select("id, stocktake_number, status, notes, started_at, completed_at, locations(name), categories(name), stocktake_items(count)", { count: "exact" })
    .eq("organization_id", organization.id)
    .order("started_at", { ascending: false })
    .range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1);
  if (locationId) request = request.eq("location_id", locationId);
  if (status) request = request.eq("status", status);

  const [locations, result] = await Promise.all([getLocations(supabase, organization.id), request]);
  if (result.error) {
    logDbError("stocktakes list", result.error);
    throw new Error("棚卸の読み込みに失敗しました。");
  }
  const canManage = hasPermission(context.role, "stocktake.manage") && !organization.isDemoReadonly;

  return (
    <>
      <PageHeader
        title="棚卸"
        description="開始時点の在庫を理論在庫として記録し、実数との差異を確定時に在庫へ反映します。"
        actions={
          canManage ? (
            <ButtonLink href="/stocktakes/new">
              <ClipboardCheck className="size-4" aria-hidden="true" />
              棚卸を開始
            </ButtonLink>
          ) : null
        }
      />
      <FilterBar basePath="/stocktakes">
        <FilterSelect label="拠点" name="location" value={locationId} placeholder="すべての拠点" options={activeLocationOptions(locations)} />
        <FilterSelect label="状態" name="status" value={status} placeholder="すべて" options={STATUS.map((value) => ({ value, label: STOCKTAKE_STATUS_LABELS[value] }))} />
      </FilterBar>
      <Card className="mt-4">
        {result.data.length === 0 ? (
          <EmptyState icon={ClipboardCheck} title="棚卸の記録はありません" action={canManage ? <ButtonLink href="/stocktakes/new" variant="secondary">棚卸を開始</ButtonLink> : null} />
        ) : (
          <>
            <TableContainer caption="棚卸一覧">
              <thead>
                <tr>
                  <th scope="col" className={th}>棚卸番号</th>
                  <th scope="col" className={th}>拠点</th>
                  <th scope="col" className={th}>対象カテゴリ</th>
                  <th scope="col" className={thRight}>品目数</th>
                  <th scope="col" className={th}>状態</th>
                  <th scope="col" className={th}>開始</th>
                  <th scope="col" className={th}>確定・中止</th>
                </tr>
              </thead>
              <tbody>
                {result.data.map((st) => (
                  <tr key={st.id} className={tr}>
                    <td className={`${td} whitespace-nowrap`}>
                      <Link href={`/stocktakes/${st.id}`} className="font-medium hover:underline">
                        {st.stocktake_number}
                      </Link>
                      {st.notes ? <p className="text-xs text-slate-500">{st.notes}</p> : null}
                    </td>
                    <td className={`${td} whitespace-nowrap`}>{st.locations?.name}</td>
                    <td className={td}>{st.categories?.name ?? "全カテゴリ"}</td>
                    <td className={tdRight}>{(st.stocktake_items[0]?.count ?? 0).toLocaleString("ja-JP")}</td>
                    <td className={td}>
                      <Badge tone={STOCKTAKE_STATUS_TONES[st.status] ?? "neutral"}>{label(STOCKTAKE_STATUS_LABELS, st.status)}</Badge>
                    </td>
                    <td className={`${td} text-xs whitespace-nowrap`}>{formatDateTime(st.started_at)}</td>
                    <td className={`${td} text-xs whitespace-nowrap`}>{formatDateTime(st.completed_at)}</td>
                  </tr>
                ))}
              </tbody>
            </TableContainer>
            <Pagination basePath="/stocktakes" params={{ location: locationId, status }} page={page} total={result.count ?? 0} />
          </>
        )}
      </Card>
    </>
  );
}
