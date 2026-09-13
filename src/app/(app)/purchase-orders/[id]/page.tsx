import type { Metadata } from "next";
import { PackagePlus } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";

import { ButtonLink } from "@/components/ui/button";
import { Badge, Card, CardBody, CardHeader, DetailList, EmptyState, PageHeader, TableContainer, td, tdRight, th, thRight, tr } from "@/components/ui/primitives";
import { requireOrgContext } from "@/lib/auth/context";
import { hasPermission } from "@/lib/domain/permissions";
import { logDbError } from "@/lib/errors";
import { formatCurrency, formatDate, formatDateTime, formatQuantity } from "@/lib/format";
import { PO_STATUS_LABELS, PO_STATUS_TONES, label } from "@/lib/labels";
import { isUuid } from "@/lib/search-params";

import { PurchaseOrderDraftForm, PurchaseOrderStatusActions } from "../purchase-order-forms";

export const metadata: Metadata = { title: "発注書詳細" };

export default async function PurchaseOrderDetailPage({ params }: PageProps<"/purchase-orders/[id]">) {
  const { id } = await params;
  if (!isUuid(id)) notFound();
  const context = await requireOrgContext();
  const { supabase, organization } = context;

  const [orderResult, receiptsResult] = await Promise.all([
    supabase
      .from("purchase_orders")
      .select(
        "*, suppliers(id, code, company_name, contact_name, phone, email, minimum_order_amount), locations(name), profiles(display_name), purchase_order_items(id, ordered_quantity, received_quantity, unit_cost, tax_rate, subtotal, ai_recommended_quantity, ai_reason, products(id, sku, product_name, sales_unit, order_lot_size, minimum_order_quantity))",
      )
      .eq("id", id)
      .eq("organization_id", organization.id)
      .maybeSingle(),
    supabase
      .from("receipts")
      .select("id, receipt_number, received_date, total_quantity, total_amount, profiles(display_name)")
      .eq("purchase_order_id", id)
      .eq("organization_id", organization.id)
      .order("received_date", { ascending: false }),
  ]);
  if (orderResult.error || receiptsResult.error) {
    logDbError("purchase order detail", orderResult.error ?? receiptsResult.error);
    throw new Error("発注書の読み込みに失敗しました。");
  }
  const order = orderResult.data;
  if (!order) notFound();

  const items = [...order.purchase_order_items].sort((a, b) => (a.products?.sku ?? "").localeCompare(b.products?.sku ?? ""));
  const hasReceived = items.some((item) => item.received_quantity > 0);
  const hasAi = items.some((item) => item.ai_recommended_quantity !== null);
  const canManage = hasPermission(context.role, "purchase.manage") && !organization.isDemoReadonly;
  const canReceive = hasPermission(context.role, "inventory.receive") && !organization.isDemoReadonly;
  const belowMinimum = order.suppliers && order.subtotal < order.suppliers.minimum_order_amount;

  return (
    <>
      <PageHeader
        title={`発注書 ${order.order_number}`}
        description={
          <span className="flex flex-wrap items-center gap-2">
            {order.suppliers?.company_name} → {order.locations?.name}
            <Badge tone={PO_STATUS_TONES[order.status] ?? "neutral"}>{label(PO_STATUS_LABELS, order.status)}</Badge>
            {hasAi ? <Badge tone="info">AI発注提案から作成</Badge> : null}
          </span>
        }
        breadcrumbs={[{ href: "/purchase-orders", label: "発注" }]}
        actions={
          <>
            {canManage ? <PurchaseOrderStatusActions orderId={order.id} status={order.status} hasReceived={hasReceived} /> : null}
            {canReceive && (order.status === "ordered" || order.status === "partially_received") ? (
              <ButtonLink href={`/receipts/new?po=${order.id}`}>
                <PackagePlus className="size-4" aria-hidden="true" />
                入庫登録
              </ButtonLink>
            ) : null}
          </>
        }
      />

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader title="発注情報" />
          <CardBody>
            <DetailList
              items={[
                { label: "発注日", value: formatDate(order.order_date) },
                { label: "納品予定日", value: formatDate(order.expected_delivery_date) },
                { label: "仕入先", value: order.suppliers ? <Link href={`/suppliers/${order.suppliers.id}`} className="hover:underline">{order.suppliers.company_name}（{order.suppliers.code}）</Link> : null },
                { label: "連絡先", value: [order.suppliers?.contact_name, order.suppliers?.phone, order.suppliers?.email].filter(Boolean).join("・") || null },
                { label: "作成者", value: order.profiles?.display_name ?? "システム" },
                { label: "発注確定", value: formatDateTime(order.ordered_at) },
                { label: "入荷完了", value: formatDateTime(order.received_at) },
                { label: "キャンセル", value: formatDateTime(order.cancelled_at) },
                { label: "備考", value: order.notes },
              ]}
            />
          </CardBody>
        </Card>
        <Card>
          <CardHeader title="金額" />
          <CardBody>
            <dl className="space-y-2 text-sm">
              <div className="flex justify-between">
                <dt className="text-slate-600">小計（税抜）</dt>
                <dd className="tabular">{formatCurrency(order.subtotal, true)}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-slate-600">消費税</dt>
                <dd className="tabular">{formatCurrency(order.tax_amount)}</dd>
              </div>
              <div className="flex justify-between border-t border-slate-100 pt-2 text-base font-semibold">
                <dt>合計</dt>
                <dd className="tabular">{formatCurrency(order.total_amount, true)}</dd>
              </div>
            </dl>
            {belowMinimum ? (
              <p className="mt-3 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900">
                仕入先の最低発注金額（{formatCurrency(order.suppliers?.minimum_order_amount)}）に達していません。
              </p>
            ) : null}
          </CardBody>
        </Card>

        <Card className="xl:col-span-3">
          <CardHeader title="発注明細" description={order.status === "draft" && canManage ? "下書きの間は数量・納品予定日・備考を編集できます。" : undefined} />
          {order.status === "draft" && canManage ? (
            <PurchaseOrderDraftForm
              orderId={order.id}
              orderDate={order.order_date}
              expectedDeliveryDate={order.expected_delivery_date}
              notes={order.notes}
              items={items.map((item) => ({
                id: item.id,
                productName: item.products?.product_name ?? "",
                sku: item.products?.sku ?? "",
                unit: item.products?.sales_unit ?? "",
                quantity: item.ordered_quantity,
                unitCost: item.unit_cost,
                taxRate: item.tax_rate,
                orderLotSize: item.products?.order_lot_size ?? 1,
                minimumOrderQuantity: item.products?.minimum_order_quantity ?? 0,
              }))}
            />
          ) : (
            <TableContainer caption="発注明細">
              <thead>
                <tr>
                  <th scope="col" className={th}>商品</th>
                  <th scope="col" className={thRight}>発注数</th>
                  <th scope="col" className={thRight}>入荷済</th>
                  <th scope="col" className={thRight}>発注残</th>
                  <th scope="col" className={thRight}>単価</th>
                  <th scope="col" className={thRight}>小計</th>
                  <th scope="col" className={th}>AI推奨</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item) => (
                  <tr key={item.id} className={tr}>
                    <td className={`${td} min-w-56`}>
                      <Link href={`/products/${item.products?.id}`} className="hover:underline">
                        {item.products?.product_name}
                      </Link>
                      <p className="font-mono text-xs text-slate-500">{item.products?.sku}</p>
                    </td>
                    <td className={tdRight}>{formatQuantity(item.ordered_quantity, item.products?.sales_unit)}</td>
                    <td className={tdRight}>{formatQuantity(item.received_quantity)}</td>
                    <td className={`${tdRight} ${item.ordered_quantity - item.received_quantity > 0 ? "font-semibold" : "text-slate-500"}`}>
                      {formatQuantity(item.ordered_quantity - item.received_quantity)}
                    </td>
                    <td className={tdRight}>{formatCurrency(item.unit_cost, true)}</td>
                    <td className={tdRight}>{formatCurrency(item.subtotal)}</td>
                    <td className={`${td} min-w-64 text-xs text-slate-600`}>
                      {item.ai_recommended_quantity !== null ? (
                        <>
                          推奨 {formatQuantity(item.ai_recommended_quantity)}
                          {item.ai_reason ? <p className="mt-0.5">{item.ai_reason}</p> : null}
                        </>
                      ) : (
                        "—"
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </TableContainer>
          )}
        </Card>

        <Card className="xl:col-span-3">
          <CardHeader title="入庫履歴" />
          {receiptsResult.data.length === 0 ? (
            <EmptyState title="まだ入庫されていません" />
          ) : (
            <TableContainer caption="この発注書の入庫履歴">
              <thead>
                <tr>
                  <th scope="col" className={th}>入庫日</th>
                  <th scope="col" className={th}>入庫番号</th>
                  <th scope="col" className={thRight}>数量</th>
                  <th scope="col" className={thRight}>金額</th>
                  <th scope="col" className={th}>担当</th>
                </tr>
              </thead>
              <tbody>
                {receiptsResult.data.map((r) => (
                  <tr key={r.id} className={tr}>
                    <td className={td}>{formatDate(r.received_date)}</td>
                    <td className={td}>
                      <Link href={`/inventory/transactions?reference=${r.id}`} className="hover:underline">
                        {r.receipt_number}
                      </Link>
                    </td>
                    <td className={tdRight}>{formatQuantity(r.total_quantity)}</td>
                    <td className={tdRight}>{formatCurrency(r.total_amount)}</td>
                    <td className={td}>{r.profiles?.display_name ?? "システム"}</td>
                  </tr>
                ))}
              </tbody>
            </TableContainer>
          )}
        </Card>
      </div>
    </>
  );
}
