import type { Metadata } from "next";

import { PageHeader } from "@/components/ui/primitives";
import { requirePagePermission } from "@/lib/auth/context";
import { activeLocationOptions, getLocations, getSuppliers } from "@/lib/data/lookups";
import { todayJst } from "@/lib/format";
import { uuidParam } from "@/lib/search-params";

import { PurchaseOrderCreateForm } from "../purchase-order-forms";

export const metadata: Metadata = { title: "発注書の作成" };

export default async function NewPurchaseOrderPage({ searchParams }: PageProps<"/purchase-orders/new">) {
  const params = await searchParams;
  const context = await requirePagePermission("purchase.manage");
  const [suppliers, locations] = await Promise.all([
    getSuppliers(context.supabase, context.organization.id),
    getLocations(context.supabase, context.organization.id),
  ]);
  const active = suppliers.filter((s) => s.is_active);
  const requested = uuidParam(params, "supplier");

  return (
    <>
      <PageHeader
        title="発注書の作成"
        description="手動で発注書を作成します。在庫状況から自動で発注数を決めたい場合は「AI発注提案」を利用してください。"
        breadcrumbs={[{ href: "/purchase-orders", label: "発注" }]}
      />
      <PurchaseOrderCreateForm
        today={todayJst()}
        initialSupplierId={active.some((s) => s.id === requested) ? requested : undefined}
        suppliers={active.map((s) => ({ value: s.id, label: `${s.company_name}（LT ${s.standard_lead_time_days}日）`, leadTime: s.standard_lead_time_days }))}
        locations={activeLocationOptions(locations)}
      />
    </>
  );
}
