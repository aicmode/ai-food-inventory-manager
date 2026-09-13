import type { Metadata } from "next";
import { MapPin, Pencil } from "lucide-react";

import { ButtonLink } from "@/components/ui/button";
import { Badge, Card, CardBody, CardHeader, EmptyState, PageHeader, TableContainer, td, tdRight, th, thRight, tr } from "@/components/ui/primitives";
import { requireOrgContext } from "@/lib/auth/context";
import { loadDashboardSummary } from "@/lib/data/dashboard";
import { hasPermission } from "@/lib/domain/permissions";
import { logDbError } from "@/lib/errors";
import { formatCurrency, formatQuantity } from "@/lib/format";
import { LOCATION_TYPE_LABELS, label } from "@/lib/labels";
import { uuidParam } from "@/lib/search-params";

import { createLocationAction, updateLocationAction } from "./actions";
import { LocationForm } from "./location-form";

export const metadata: Metadata = { title: "拠点" };

export default async function LocationsPage({ searchParams }: PageProps<"/locations">) {
  const params = await searchParams;
  const context = await requireOrgContext();
  const { supabase, organization } = context;
  const editId = uuidParam(params, "edit");

  const [result, summary] = await Promise.all([
    supabase.from("locations").select("*").eq("organization_id", organization.id).order("type").order("code"),
    loadDashboardSummary(context),
  ]);
  if (result.error) {
    logDbError("locations list", result.error);
    throw new Error("拠点の読み込みに失敗しました。");
  }
  const canManage = hasPermission(context.role, "locations.manage") && !organization.isDemoReadonly;
  const editing = editId ? result.data.find((l) => l.id === editId) : undefined;
  const stockByName = new Map(summary.locationValues.map((l) => [l.name, l]));

  return (
    <>
      <PageHeader title="拠点" description="店舗・倉庫ごとに在庫・発注・棚卸を管理します。" />
      <Card>
        {result.data.length === 0 ? (
          <EmptyState icon={MapPin} title="拠点が登録されていません" />
        ) : (
          <TableContainer caption="拠点一覧">
            <thead>
              <tr>
                <th scope="col" className={th}>コード</th>
                <th scope="col" className={th}>拠点名</th>
                <th scope="col" className={th}>種別</th>
                <th scope="col" className={th}>所在地・電話</th>
                <th scope="col" className={thRight}>在庫数量</th>
                <th scope="col" className={thRight}>在庫金額</th>
                <th scope="col" className={th}>状態</th>
                <th scope="col" className={th}>
                  <span className="sr-only">操作</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {result.data.map((location) => {
                const stock = stockByName.get(location.name);
                return (
                  <tr key={location.id} className={tr}>
                    <td className={`${td} font-mono text-xs`}>{location.code}</td>
                    <td className={`${td} font-medium`}>{location.name}</td>
                    <td className={td}>
                      <Badge tone="neutral" icon={false}>
                        {label(LOCATION_TYPE_LABELS, location.type)}
                      </Badge>
                    </td>
                    <td className={`${td} text-xs text-slate-600`}>
                      {[location.postal_code ? `〒${location.postal_code}` : null, location.prefecture, location.city, location.address].filter(Boolean).join(" ") || "—"}
                      {location.phone ? <p>{location.phone}</p> : null}
                    </td>
                    <td className={tdRight}>{stock ? formatQuantity(stock.quantity) : "—"}</td>
                    <td className={tdRight}>{stock ? formatCurrency(stock.value) : "—"}</td>
                    <td className={td}>{location.is_active ? <Badge tone="success">稼働中</Badge> : <Badge tone="neutral">無効</Badge>}</td>
                    <td className={td}>
                      {canManage ? (
                        <ButtonLink href={`/locations?edit=${location.id}`} variant="ghost" size="sm">
                          <Pencil className="size-3.5" aria-hidden="true" />
                          編集
                        </ButtonLink>
                      ) : null}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </TableContainer>
        )}
      </Card>

      {canManage ? (
        <Card className="mt-6">
          <CardHeader title={editing ? `拠点の編集：${editing.name}` : "拠点の追加"} />
          <CardBody>
            {editing ? (
              <LocationForm key={editing.id} action={updateLocationAction.bind(null, editing.id)} defaults={editing} submitLabel="保存する" editing />
            ) : (
              <LocationForm action={createLocationAction} submitLabel="拠点を追加" editing={false} />
            )}
          </CardBody>
        </Card>
      ) : (
        <p className="mt-4 text-xs text-slate-500">拠点の追加・編集はオーナー・管理者のみ行えます。</p>
      )}
    </>
  );
}
