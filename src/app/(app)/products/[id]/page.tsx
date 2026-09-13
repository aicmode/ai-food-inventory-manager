import type { Metadata } from "next";
import { Pencil } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";

import { ButtonLink } from "@/components/ui/button";
import { Badge, Card, CardBody, CardHeader, DetailList, EmptyState, PageHeader, TableContainer, td, tdRight, th, thRight, tr } from "@/components/ui/primitives";
import { requireOrgContext } from "@/lib/auth/context";
import { getCategories } from "@/lib/data/lookups";
import { loadRecommendations } from "@/lib/data/recommendations";
import { deriveLotStatus } from "@/lib/domain/inventory";
import { hasPermission } from "@/lib/domain/permissions";
import { logDbError } from "@/lib/errors";
import { formatCurrency, formatDate, formatDateTime, formatQuantity, todayJst } from "@/lib/format";
import {
  LOT_STATUS_LABELS,
  LOT_STATUS_TONES,
  PO_STATUS_LABELS,
  PO_STATUS_TONES,
  RISK_LEVEL_LABELS,
  RISK_TONES,
  STORAGE_TYPE_LABELS,
  TRANSACTION_TYPE_LABELS,
  TRANSACTION_TYPE_TONES,
  label,
} from "@/lib/labels";
import { isUuid } from "@/lib/search-params";

export const metadata: Metadata = { title: "商品詳細" };

export default async function ProductDetailPage({ params }: PageProps<"/products/[id]">) {
  const { id } = await params;
  if (!isUuid(id)) notFound();
  const context = await requireOrgContext();
  const { supabase, organization } = context;
  const org = organization.id;

  const productResult = await supabase.from("products").select("*").eq("id", id).eq("organization_id", org).maybeSingle();
  if (productResult.error) {
    logDbError("product detail", productResult.error);
    throw new Error("商品の読み込みに失敗しました。");
  }
  const product = productResult.data;
  if (!product) notFound();

  const [categories, suppliersResult, lotsResult, txResult, poResult, recommendations] = await Promise.all([
    getCategories(supabase, org),
    supabase
      .from("product_suppliers")
      .select("supplier_id, supplier_product_code, purchase_price, lead_time_days, minimum_order_quantity, order_lot_size, is_primary, suppliers(code, company_name, standard_lead_time_days)")
      .eq("product_id", id)
      .eq("organization_id", org)
      .order("is_primary", { ascending: false }),
    supabase
      .from("inventory_lots")
      .select("id, lot_number, received_date, expiration_date, quantity_received, quantity_remaining, unit_cost, status, locations(name)")
      .eq("product_id", id)
      .eq("organization_id", org)
      .gt("quantity_remaining", 0)
      .order("expiration_date", { ascending: true, nullsFirst: false })
      .limit(100),
    supabase
      .from("inventory_transactions")
      .select("id, transaction_type, quantity, after_quantity, created_at, reason, locations(name)")
      .eq("product_id", id)
      .eq("organization_id", org)
      .order("created_at", { ascending: false })
      .limit(20),
    supabase
      .from("purchase_order_items")
      .select("id, ordered_quantity, received_quantity, unit_cost, purchase_orders(id, order_number, status, order_date, expected_delivery_date)")
      .eq("product_id", id)
      .eq("organization_id", org)
      .order("created_at", { ascending: false })
      .limit(10),
    loadRecommendations(context, { productId: id }),
  ]);
  for (const [name, res] of [
    ["product suppliers", suppliersResult],
    ["product lots", lotsResult],
    ["product transactions", txResult],
    ["product purchase orders", poResult],
  ] as const) {
    if (res.error) {
      logDbError(name, res.error);
      throw new Error("商品詳細の読み込みに失敗しました。");
    }
  }

  const today = todayJst();
  const category = categories.find((c) => c.id === product.category_id);
  const subcategory = categories.find((c) => c.id === product.subcategory_id);
  const canManage = hasPermission(context.role, "master.manage") && !organization.isDemoReadonly;
  const unit = product.sales_unit;
  const temperature =
    product.storage_temperature_min === null && product.storage_temperature_max === null
      ? "—"
      : `${product.storage_temperature_min ?? "—"}℃ 〜 ${product.storage_temperature_max ?? "—"}℃`;

  return (
    <>
      <PageHeader
        title={product.product_name}
        description={
          <span className="flex flex-wrap items-center gap-2">
            <span className="font-mono">{product.sku}</span>
            <Badge tone="neutral" icon={false}>
              {label(STORAGE_TYPE_LABELS, product.storage_type)}
            </Badge>
            {product.is_active ? <Badge tone="success">有効</Badge> : <Badge tone="neutral">無効</Badge>}
          </span>
        }
        breadcrumbs={[{ href: "/products", label: "商品" }]}
        actions={
          canManage ? (
            <ButtonLink href={`/products/${product.id}/edit`} variant="secondary">
              <Pencil className="size-4" aria-hidden="true" />
              編集
            </ButtonLink>
          ) : null
        }
      />

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader title="拠点別の在庫と発注判定" description="決定論的ロジックによる判定（AI発注提案と同じ計算）" />
          {recommendations.length === 0 ? (
            <EmptyState title="在庫記録のある拠点はありません" description="入庫すると拠点ごとの在庫が表示されます。" />
          ) : (
            <TableContainer caption="拠点別の在庫と発注判定">
              <thead>
                <tr>
                  <th scope="col" className={th}>拠点</th>
                  <th scope="col" className={thRight}>現在庫</th>
                  <th scope="col" className={thRight}>利用可能</th>
                  <th scope="col" className={thRight}>7日 / 30日平均</th>
                  <th scope="col" className={thRight}>入荷予定</th>
                  <th scope="col" className={th}>欠品予測日</th>
                  <th scope="col" className={thRight}>推奨数</th>
                  <th scope="col" className={th}>リスク</th>
                </tr>
              </thead>
              <tbody>
                {recommendations.map(({ row, result, shortReason }) => (
                  <tr key={row.location_id} className={tr}>
                    <td className={`${td} whitespace-nowrap`}>
                      <Link href={`/ai-orders?location=${row.location_id}&view=all&q=${encodeURIComponent(row.sku)}`} className="hover:underline">
                        {row.location_name}
                      </Link>
                    </td>
                    <td className={tdRight}>{formatQuantity(row.quantity_on_hand)}</td>
                    <td className={tdRight}>{formatQuantity(result.availableStock)}</td>
                    <td className={tdRight}>
                      {formatQuantity(result.average7d)} / {formatQuantity(result.average30d)}
                    </td>
                    <td className={tdRight}>{formatQuantity(row.incoming_quantity)}</td>
                    <td className={`${td} whitespace-nowrap`}>{formatDate(result.stockoutDate)}</td>
                    <td className={`${tdRight} font-semibold`}>{formatQuantity(result.recommendedQuantity, unit)}</td>
                    <td className={td}>
                      <div className="flex flex-col items-start gap-1" title={shortReason}>
                        <Badge tone={RISK_TONES[result.shortageRisk]}>欠品 {RISK_LEVEL_LABELS[result.shortageRisk]}</Badge>
                        <Badge tone={RISK_TONES[result.wasteRisk]}>廃棄 {RISK_LEVEL_LABELS[result.wasteRisk]}</Badge>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </TableContainer>
          )}
        </Card>

        <Card>
          <CardHeader title="仕入先" />
          {suppliersResult.data && suppliersResult.data.length > 0 ? (
            <ul className="divide-y divide-slate-100">
              {suppliersResult.data.map((ps) => (
                <li key={ps.supplier_id} className="px-4 py-3 text-sm">
                  <div className="flex items-center justify-between gap-2">
                    <Link href={`/suppliers/${ps.supplier_id}`} className="font-medium hover:underline">
                      {ps.suppliers?.company_name}
                    </Link>
                    {ps.is_primary ? <Badge tone="info">主要</Badge> : null}
                  </div>
                  <p className="mt-1 text-xs text-slate-600">
                    仕入単価 {ps.purchase_price === null ? "商品原価" : formatCurrency(ps.purchase_price, true)}・リードタイム{" "}
                    {ps.lead_time_days ?? product.lead_time_days}日・発注単位 {formatQuantity(ps.order_lot_size ?? product.order_lot_size)}
                    {ps.supplier_product_code ? `・仕入先品番 ${ps.supplier_product_code}` : ""}
                  </p>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState title="仕入先が設定されていません" />
          )}
        </Card>

        <Card className="xl:col-span-3">
          <CardHeader title="商品情報" />
          <CardBody>
            <DetailList
              columns={3}
              items={[
                { label: "JANコード", value: product.jan_code },
                { label: "商品名カナ", value: product.product_name_kana },
                { label: "メーカー / ブランド", value: [product.manufacturer, product.brand].filter(Boolean).join(" / ") || null },
                { label: "カテゴリ", value: [category?.name, subcategory?.name].filter(Boolean).join(" › ") || "未分類" },
                { label: "規格", value: product.specification },
                { label: "内容量", value: product.content_amount ? `${product.content_amount} ${product.content_unit ?? ""}` : null },
                { label: "販売単位 / 仕入単位", value: `${product.sales_unit} / ${product.purchase_unit}（${product.units_per_case}${unit}入）` },
                { label: "原価 / 売価", value: `${formatCurrency(product.cost_price, true)} / ${formatCurrency(product.selling_price)}` },
                { label: "税率", value: `${product.tax_rate}%` },
                { label: "保存温度", value: temperature },
                { label: "賞味期間", value: product.shelf_life_days ? `${product.shelf_life_days}日` : null },
                { label: "期限アラート", value: `${product.expiration_warning_days}日前` },
                { label: "安全在庫 / 発注点", value: `${formatQuantity(product.safety_stock)} / ${formatQuantity(product.reorder_point)} ${unit}` },
                { label: "標準発注数", value: formatQuantity(product.standard_order_quantity, unit) },
                { label: "最小発注数量 / 発注単位", value: `${formatQuantity(product.minimum_order_quantity)} / ${formatQuantity(product.order_lot_size)} ${unit}` },
                { label: "リードタイム", value: `${product.lead_time_days}日` },
                { label: "保管場所", value: product.storage_location_note },
                { label: "更新日時", value: formatDateTime(product.updated_at) },
                { label: "備考", value: product.notes },
              ]}
            />
          </CardBody>
        </Card>

        <Card className="xl:col-span-2">
          <CardHeader
            title="在庫ロット（FEFO順）"
            action={
              <Link href={`/inventory/lots?q=${encodeURIComponent(product.sku)}`} className="text-sm font-medium text-emerald-800 hover:underline">
                ロット一覧
              </Link>
            }
          />
          {lotsResult.data && lotsResult.data.length > 0 ? (
            <TableContainer caption="在庫ロット">
              <thead>
                <tr>
                  <th scope="col" className={th}>賞味期限</th>
                  <th scope="col" className={th}>ロット</th>
                  <th scope="col" className={th}>拠点</th>
                  <th scope="col" className={thRight}>残数</th>
                  <th scope="col" className={th}>状態</th>
                </tr>
              </thead>
              <tbody>
                {lotsResult.data.map((lot) => {
                  const status = deriveLotStatus({
                    status: lot.status,
                    quantityRemaining: lot.quantity_remaining,
                    expirationDate: lot.expiration_date,
                    today,
                    warningDays: product.expiration_warning_days,
                  });
                  return (
                    <tr key={lot.id} className={tr}>
                      <td className={`${td} whitespace-nowrap`}>{formatDate(lot.expiration_date)}</td>
                      <td className={`${td} font-mono text-xs`}>{lot.lot_number}</td>
                      <td className={`${td} whitespace-nowrap`}>{lot.locations?.name}</td>
                      <td className={tdRight}>{formatQuantity(lot.quantity_remaining, unit)}</td>
                      <td className={td}>
                        <Badge tone={LOT_STATUS_TONES[status]}>{LOT_STATUS_LABELS[status]}</Badge>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </TableContainer>
          ) : (
            <EmptyState title="在庫ロットはありません" />
          )}
        </Card>

        <Card>
          <CardHeader title="最近の発注" />
          {poResult.data && poResult.data.length > 0 ? (
            <ul className="divide-y divide-slate-100">
              {poResult.data.map((item) => (
                <li key={item.id} className="px-4 py-2.5 text-sm">
                  <div className="flex items-center justify-between gap-2">
                    <Link href={`/purchase-orders/${item.purchase_orders?.id}`} className="font-medium hover:underline">
                      {item.purchase_orders?.order_number}
                    </Link>
                    <Badge tone={PO_STATUS_TONES[item.purchase_orders?.status ?? ""] ?? "neutral"}>
                      {label(PO_STATUS_LABELS, item.purchase_orders?.status)}
                    </Badge>
                  </div>
                  <p className="text-xs text-slate-600">
                    {formatDate(item.purchase_orders?.order_date)}・{formatQuantity(item.ordered_quantity)} 発注 / {formatQuantity(item.received_quantity)} 入荷
                  </p>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState title="発注履歴はありません" />
          )}
        </Card>

        <Card className="xl:col-span-3">
          <CardHeader
            title="最近の入出庫"
            action={
              <Link href={`/inventory/transactions?product=${product.id}`} className="text-sm font-medium text-emerald-800 hover:underline">
                すべての履歴
              </Link>
            }
          />
          {txResult.data && txResult.data.length > 0 ? (
            <TableContainer caption="最近の入出庫">
              <thead>
                <tr>
                  <th scope="col" className={th}>日時</th>
                  <th scope="col" className={th}>区分</th>
                  <th scope="col" className={th}>拠点</th>
                  <th scope="col" className={thRight}>数量</th>
                  <th scope="col" className={thRight}>処理後在庫</th>
                  <th scope="col" className={th}>理由</th>
                </tr>
              </thead>
              <tbody>
                {txResult.data.map((t) => (
                  <tr key={t.id} className={tr}>
                    <td className={`${td} whitespace-nowrap`}>{formatDateTime(t.created_at)}</td>
                    <td className={td}>
                      <Badge tone={TRANSACTION_TYPE_TONES[t.transaction_type] ?? "neutral"}>{label(TRANSACTION_TYPE_LABELS, t.transaction_type)}</Badge>
                    </td>
                    <td className={`${td} whitespace-nowrap`}>{t.locations?.name}</td>
                    <td className={tdRight}>
                      {t.quantity > 0 ? "+" : ""}
                      {formatQuantity(t.quantity)}
                    </td>
                    <td className={tdRight}>{formatQuantity(t.after_quantity)}</td>
                    <td className={`${td} text-xs text-slate-600`}>{t.reason ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </TableContainer>
          ) : (
            <EmptyState title="入出庫履歴はありません" />
          )}
        </Card>
      </div>
    </>
  );
}
