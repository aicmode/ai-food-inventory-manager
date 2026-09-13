import type { Metadata } from "next";
import { CalendarClock, Trash2 } from "lucide-react";
import Link from "next/link";

import { ButtonLink } from "@/components/ui/button";
import { FilterBar, FilterSelect, FilterText } from "@/components/ui/filter-bar";
import { Pagination, PAGE_SIZE, parsePage } from "@/components/ui/pagination";
import { Badge, Card, EmptyState, PageHeader, TableContainer, td, tdRight, th, thRight, tr } from "@/components/ui/primitives";
import { requireOrgContext } from "@/lib/auth/context";
import { activeLocationOptions, getLocations } from "@/lib/data/lookups";
import { hasPermission } from "@/lib/domain/permissions";
import { logDbError } from "@/lib/errors";
import { formatCurrency, formatDate, formatQuantity, normalizeSearchQuery } from "@/lib/format";
import { LOT_STATUS_LABELS, LOT_STATUS_TONES, STORAGE_TYPE_LABELS, label } from "@/lib/labels";
import { enumParam, textParam, uuidParam } from "@/lib/search-params";

import { LotQuarantineButton } from "./lot-actions";

export const metadata: Metadata = { title: "ロット・賞味期限" };

const STATUS = ["active", "available", "expiring_soon", "expired", "quarantined", "depleted", "all"] as const;
const STORAGE = ["room_temperature", "refrigerated", "frozen"] as const;

export default async function LotsPage({ searchParams }: PageProps<"/inventory/lots">) {
  const params = await searchParams;
  const context = await requireOrgContext();
  const { supabase, organization } = context;
  const query = textParam(params, "q");
  const locationId = uuidParam(params, "location");
  const status = enumParam(params, "status", STATUS) ?? "active";
  const storage = enumParam(params, "storage", STORAGE);
  const page = parsePage(params.page);
  const normalized = query ? normalizeSearchQuery(query) : null;

  const [locations, result] = await Promise.all([
    getLocations(supabase, organization.id),
    supabase.rpc("search_lots", {
      p_organization_id: organization.id,
      p_query: normalized?.primary,
      p_query_alt: normalized?.kana ?? undefined,
      p_location_id: locationId,
      p_status: status,
      p_storage_type: storage,
      p_limit: PAGE_SIZE,
      p_offset: (page - 1) * PAGE_SIZE,
    }),
  ]);
  if (result.error) {
    logDbError("search_lots", result.error);
    throw new Error("ロットの検索に失敗しました。");
  }
  const rows = result.data;
  const total = Number(rows[0]?.total_count ?? 0);
  const canQuarantine = hasPermission(context.role, "inventory.quarantine") && !organization.isDemoReadonly;
  const canWaste = hasPermission(context.role, "inventory.waste") && !organization.isDemoReadonly;

  return (
    <>
      <PageHeader
        title="ロット・賞味期限"
        description="出庫は賞味期限の早いロットから自動で割り当てられます（FEFO）。期限切れ・隔離中のロットは出庫されません。"
      />
      <FilterBar basePath="/inventory/lots">
        <FilterText label="キーワード" name="q" value={query} placeholder="商品名・SKU・JAN・ロット番号" />
        <FilterSelect label="拠点" name="location" value={locationId} placeholder="すべての拠点" options={activeLocationOptions(locations)} />
        <FilterSelect
          label="状態"
          name="status"
          value={status}
          options={[
            { value: "active", label: "残数あり（すべて）" },
            { value: "available", label: "使用可" },
            { value: "expiring_soon", label: "期限間近（アラート日数以内）" },
            { value: "expired", label: "期限切れ" },
            { value: "quarantined", label: "隔離中" },
            { value: "depleted", label: "消化済" },
            { value: "all", label: "すべてのロット" },
          ]}
        />
        <FilterSelect label="保存区分" name="storage" value={storage} placeholder="すべて" options={STORAGE.map((value) => ({ value, label: STORAGE_TYPE_LABELS[value] }))} />
      </FilterBar>

      <Card className="mt-4">
        {rows.length === 0 ? (
          <EmptyState icon={CalendarClock} title="条件に一致するロットはありません" />
        ) : (
          <>
            <TableContainer caption="ロット一覧">
              <thead>
                <tr>
                  <th scope="col" className={th}>賞味期限</th>
                  <th scope="col" className={th}>商品</th>
                  <th scope="col" className={th}>ロット番号</th>
                  <th scope="col" className={th}>拠点</th>
                  <th scope="col" className={th}>入庫日 / 製造日</th>
                  <th scope="col" className={thRight}>残数 / 入庫数</th>
                  <th scope="col" className={thRight}>単価</th>
                  <th scope="col" className={th}>仕入先</th>
                  <th scope="col" className={th}>状態</th>
                  <th scope="col" className={th}>
                    <span className="sr-only">操作</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {rows.map((lot) => (
                  <tr key={lot.id} className={tr}>
                    <td className={`${td} whitespace-nowrap`}>
                      {formatDate(lot.expiration_date)}
                      {lot.days_until_expiration !== null && lot.quantity_remaining > 0 ? (
                        <p className={`text-xs ${lot.days_until_expiration < 0 ? "text-red-700" : "text-slate-500"}`}>
                          {lot.days_until_expiration < 0 ? `${-lot.days_until_expiration}日超過` : lot.days_until_expiration === 0 ? "本日まで" : `あと${lot.days_until_expiration}日`}
                        </p>
                      ) : null}
                    </td>
                    <td className={`${td} min-w-56`}>
                      <Link href={`/products/${lot.product_id}`} className="font-medium hover:underline">
                        {lot.product_name}
                      </Link>
                      <p className="font-mono text-xs text-slate-500">{lot.sku}</p>
                    </td>
                    <td className={`${td} font-mono text-xs whitespace-nowrap`}>{lot.lot_number}</td>
                    <td className={`${td} whitespace-nowrap`}>{lot.location_name}</td>
                    <td className={`${td} text-xs whitespace-nowrap`}>
                      {formatDate(lot.received_date)}
                      <p className="text-slate-500">{formatDate(lot.manufacture_date)}</p>
                    </td>
                    <td className={tdRight}>
                      {formatQuantity(lot.quantity_remaining, lot.sales_unit)}
                      <p className="text-xs text-slate-500">{formatQuantity(lot.quantity_received)}</p>
                    </td>
                    <td className={tdRight}>{formatCurrency(lot.unit_cost, true)}</td>
                    <td className={`${td} text-xs`}>{lot.supplier_name ?? "—"}</td>
                    <td className={td}>
                      <Badge tone={LOT_STATUS_TONES[lot.effective_status] ?? "neutral"}>{label(LOT_STATUS_LABELS, lot.effective_status)}</Badge>
                      {lot.quarantine_reason ? <p className="mt-1 max-w-48 text-xs text-slate-500">{lot.quarantine_reason}</p> : null}
                    </td>
                    <td className={`${td} whitespace-nowrap`}>
                      <div className="flex gap-1">
                        {canWaste && lot.quantity_remaining > 0 ? (
                          <ButtonLink href={`/waste/new?lot=${lot.id}`} variant="ghost" size="sm">
                            <Trash2 className="size-3.5" aria-hidden="true" />
                            廃棄
                          </ButtonLink>
                        ) : null}
                        {canQuarantine && lot.quantity_remaining > 0 ? (
                          <LotQuarantineButton lotId={lot.id} lotNumber={lot.lot_number} quarantined={lot.status === "quarantined"} />
                        ) : null}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </TableContainer>
            <Pagination basePath="/inventory/lots" params={{ q: query, location: locationId, status, storage }} page={page} total={total} />
          </>
        )}
      </Card>
    </>
  );
}
