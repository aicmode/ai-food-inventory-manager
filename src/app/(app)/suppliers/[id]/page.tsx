import type { Metadata } from "next";
import { Pencil, ShoppingCart } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";

import { ButtonLink } from "@/components/ui/button";
import { Pagination, PAGE_SIZE, parsePage } from "@/components/ui/pagination";
import { Badge, Card, CardBody, CardHeader, DetailList, EmptyState, PageHeader, TableContainer, td, tdRight, th, thRight, tr } from "@/components/ui/primitives";
import { requireOrgContext } from "@/lib/auth/context";
import { hasPermission } from "@/lib/domain/permissions";
import { logDbError } from "@/lib/errors";
import { formatCurrency, formatDate, formatQuantity } from "@/lib/format";
import { PO_STATUS_LABELS, PO_STATUS_TONES, STORAGE_TYPE_LABELS, label } from "@/lib/labels";
import { isUuid } from "@/lib/search-params";

export const metadata: Metadata = { title: "仕入先詳細" };

export default async function SupplierDetailPage({ params, searchParams }: PageProps<"/suppliers/[id]">) {
  const { id } = await params;
  if (!isUuid(id)) notFound();
  const query = await searchParams;
  const page = parsePage(query.page);
  const context = await requireOrgContext();
  const { supabase, organization } = context;

  const [supplierResult, productsResult, ordersResult] = await Promise.all([
    supabase.from("suppliers").select("*").eq("id", id).eq("organization_id", organization.id).maybeSingle(),
    supabase
      .from("product_suppliers")
      .select("product_id, is_primary, purchase_price, lead_time_days, supplier_product_code, products(sku, product_name, storage_type, order_lot_size, sales_unit, is_active)", { count: "exact" })
      .eq("supplier_id", id)
      .eq("organization_id", organization.id)
      .order("is_primary", { ascending: false })
      .order("product_id")
      .range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1),
    supabase
      .from("purchase_orders")
      .select("id, order_number, status, order_date, expected_delivery_date, total_amount, locations(name)")
      .eq("supplier_id", id)
      .eq("organization_id", organization.id)
      .order("order_date", { ascending: false })
      .limit(10),
  ]);
  if (supplierResult.error || productsResult.error || ordersResult.error) {
    logDbError("supplier detail", supplierResult.error ?? productsResult.error ?? ordersResult.error);
    throw new Error("仕入先の読み込みに失敗しました。");
  }
  const supplier = supplierResult.data;
  if (!supplier) notFound();
  const canManage = hasPermission(context.role, "master.manage") && !organization.isDemoReadonly;
  const canOrder = hasPermission(context.role, "purchase.manage") && !organization.isDemoReadonly && supplier.is_active;

  return (
    <>
      <PageHeader
        title={supplier.company_name}
        description={
          <span className="flex items-center gap-2">
            <span className="font-mono">{supplier.code}</span>
            {supplier.is_active ? <Badge tone="success">取引中</Badge> : <Badge tone="neutral">無効</Badge>}
          </span>
        }
        breadcrumbs={[{ href: "/suppliers", label: "仕入先" }]}
        actions={
          <>
            {canOrder ? (
              <ButtonLink href={`/purchase-orders/new?supplier=${supplier.id}`} variant="secondary">
                <ShoppingCart className="size-4" aria-hidden="true" />
                発注書を作成
              </ButtonLink>
            ) : null}
            {canManage ? (
              <ButtonLink href={`/suppliers/${supplier.id}/edit`} variant="secondary">
                <Pencil className="size-4" aria-hidden="true" />
                編集
              </ButtonLink>
            ) : null}
          </>
        }
      />
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader title="基本情報" />
          <CardBody>
            <DetailList
              items={[
                { label: "担当者", value: supplier.contact_name },
                { label: "メール", value: supplier.email },
                { label: "電話番号", value: supplier.phone },
                { label: "住所", value: [supplier.postal_code ? `〒${supplier.postal_code}` : null, supplier.prefecture, supplier.city, supplier.address].filter(Boolean).join(" ") || null },
                { label: "支払条件", value: supplier.payment_terms },
                { label: "最低発注金額", value: formatCurrency(supplier.minimum_order_amount) },
                { label: "標準リードタイム", value: `${supplier.standard_lead_time_days}日` },
                { label: "備考", value: supplier.notes },
              ]}
            />
          </CardBody>
        </Card>
        <Card>
          <CardHeader title="最近の発注" />
          {ordersResult.data.length === 0 ? (
            <EmptyState title="発注履歴はありません" />
          ) : (
            <ul className="divide-y divide-slate-100">
              {ordersResult.data.map((po) => (
                <li key={po.id} className="px-4 py-2.5 text-sm">
                  <div className="flex items-center justify-between gap-2">
                    <Link href={`/purchase-orders/${po.id}`} className="font-medium hover:underline">
                      {po.order_number}
                    </Link>
                    <Badge tone={PO_STATUS_TONES[po.status] ?? "neutral"}>{label(PO_STATUS_LABELS, po.status)}</Badge>
                  </div>
                  <p className="text-xs text-slate-600">
                    {formatDate(po.order_date)}・{po.locations?.name}・{formatCurrency(po.total_amount)}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </Card>
        <Card className="xl:col-span-3">
          <CardHeader title="取扱商品" description={`${(productsResult.count ?? 0).toLocaleString("ja-JP")} 品目`} />
          {productsResult.data.length === 0 ? (
            <EmptyState title="取扱商品は登録されていません" description="商品の「主要仕入先」に設定すると表示されます。" />
          ) : (
            <>
              <TableContainer caption="取扱商品">
                <thead>
                  <tr>
                    <th scope="col" className={th}>商品</th>
                    <th scope="col" className={th}>区分</th>
                    <th scope="col" className={th}>保存</th>
                    <th scope="col" className={th}>仕入先品番</th>
                    <th scope="col" className={thRight}>仕入単価</th>
                    <th scope="col" className={thRight}>発注単位</th>
                  </tr>
                </thead>
                <tbody>
                  {productsResult.data.map((ps) => (
                    <tr key={ps.product_id} className={tr}>
                      <td className={`${td} min-w-56`}>
                        <Link href={`/products/${ps.product_id}`} className="hover:underline">
                          {ps.products?.product_name}
                        </Link>
                        <p className="font-mono text-xs text-slate-500">{ps.products?.sku}</p>
                      </td>
                      <td className={td}>{ps.is_primary ? <Badge tone="info">主要</Badge> : <Badge tone="neutral" icon={false}>予備</Badge>}</td>
                      <td className={td}>{label(STORAGE_TYPE_LABELS, ps.products?.storage_type)}</td>
                      <td className={`${td} font-mono text-xs`}>{ps.supplier_product_code ?? "—"}</td>
                      <td className={tdRight}>{ps.purchase_price === null ? "商品原価" : formatCurrency(ps.purchase_price, true)}</td>
                      <td className={tdRight}>{formatQuantity(ps.products?.order_lot_size, ps.products?.sales_unit)}</td>
                    </tr>
                  ))}
                </tbody>
              </TableContainer>
              <Pagination basePath={`/suppliers/${supplier.id}`} params={{}} page={page} total={productsResult.count ?? 0} />
            </>
          )}
        </Card>
      </div>
    </>
  );
}
