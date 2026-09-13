import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { Alert, PageHeader } from "@/components/ui/primitives";
import { requirePagePermission } from "@/lib/auth/context";
import { activeLocationOptions, getLocations, getSuppliers } from "@/lib/data/lookups";
import { logDbError } from "@/lib/errors";
import { formatDate, todayJst } from "@/lib/format";
import { uuidParam } from "@/lib/search-params";

import { ReceiptForm, type PurchaseOrderPrefill } from "../receipt-form";

export const metadata: Metadata = { title: "入庫登録" };

export default async function NewReceiptPage({ searchParams }: PageProps<"/receipts/new">) {
  const params = await searchParams;
  const context = await requirePagePermission("inventory.receive");
  const { supabase, organization } = context;
  const poId = uuidParam(params, "po");

  const [locations, suppliers, openOrders] = await Promise.all([
    getLocations(supabase, organization.id),
    getSuppliers(supabase, organization.id),
    supabase
      .from("purchase_orders")
      .select("id, order_number, expected_delivery_date, suppliers(company_name), locations(name)")
      .eq("organization_id", organization.id)
      .in("status", ["ordered", "partially_received"])
      .order("expected_delivery_date", { ascending: true })
      .limit(200),
  ]);
  if (openOrders.error) {
    logDbError("open orders", openOrders.error);
    throw new Error("発注書の読み込みに失敗しました。");
  }

  let prefill: PurchaseOrderPrefill | null = null;
  if (poId) {
    const { data, error } = await supabase
      .from("purchase_orders")
      .select(
        "id, order_number, status, location_id, supplier_id, purchase_order_items(ordered_quantity, received_quantity, unit_cost, products(id, sku, product_name, sales_unit, cost_price, order_lot_size, minimum_order_quantity, shelf_life_days, primary_supplier_id))",
      )
      .eq("id", poId)
      .eq("organization_id", organization.id)
      .maybeSingle();
    if (error) {
      logDbError("receipt prefill", error);
      throw new Error("発注書の読み込みに失敗しました。");
    }
    if (!data) notFound();
    if (data.status === "ordered" || data.status === "partially_received") {
      prefill = {
        id: data.id,
        orderNumber: data.order_number,
        locationId: data.location_id,
        supplierId: data.supplier_id,
        lines: data.purchase_order_items
          .filter((item) => item.products && item.received_quantity < item.ordered_quantity)
          .map((item) => ({
            product: item.products!,
            remaining: item.ordered_quantity - item.received_quantity,
            unitCost: item.unit_cost,
          })),
      };
    }
  }

  return (
    <>
      <PageHeader
        title="入庫登録"
        description="入庫するとロットが作成され、在庫・入出庫履歴・発注書の入荷数が同時に更新されます。"
        breadcrumbs={[{ href: "/receipts", label: "入庫" }]}
      />
      {poId && !prefill ? (
        <div className="mb-4">
          <Alert tone="warning">この発注書は入庫できる状態ではありません（発注済・一部入荷のみ入庫できます）。</Alert>
        </div>
      ) : null}
      <ReceiptForm
        key={prefill?.id ?? "manual"}
        today={todayJst()}
        locations={activeLocationOptions(locations)}
        suppliers={suppliers.filter((s) => s.is_active).map((s) => ({ value: s.id, label: s.company_name }))}
        openOrders={openOrders.data.map((o) => ({
          value: o.id,
          label: `${o.order_number}｜${o.suppliers?.company_name ?? ""}｜${o.locations?.name ?? ""}｜納品予定 ${formatDate(o.expected_delivery_date)}`,
        }))}
        prefill={prefill}
      />
    </>
  );
}
