import type { Metadata } from "next";

import { PageHeader } from "@/components/ui/primitives";
import { requirePagePermission } from "@/lib/auth/context";
import { activeLocationOptions, getLocations } from "@/lib/data/lookups";
import { logDbError } from "@/lib/errors";
import { todayJst } from "@/lib/format";
import { uuidParam } from "@/lib/search-params";

import { WasteForm } from "../waste-form";

export const metadata: Metadata = { title: "廃棄登録" };

export default async function NewWastePage({ searchParams }: PageProps<"/waste/new">) {
  const params = await searchParams;
  const context = await requirePagePermission("inventory.waste");
  const { supabase, organization } = context;
  const lotId = uuidParam(params, "lot");
  const locations = await getLocations(supabase, organization.id);

  let initial = null;
  if (lotId) {
    const { data, error } = await supabase
      .from("inventory_lots")
      .select("id, location_id, products(id, sku, product_name, sales_unit, cost_price, order_lot_size, minimum_order_quantity, shelf_life_days, primary_supplier_id)")
      .eq("id", lotId)
      .eq("organization_id", organization.id)
      .maybeSingle();
    if (error) {
      logDbError("waste prefill", error);
      throw new Error("ロットの読み込みに失敗しました。");
    }
    if (data?.products) initial = { locationId: data.location_id, product: data.products, lotId: data.id };
  }

  return (
    <>
      <PageHeader
        title="廃棄登録"
        description="期限切れ・破損・品質不良などで廃棄した在庫を登録します。"
        breadcrumbs={[{ href: "/waste", label: "廃棄" }]}
      />
      <WasteForm today={todayJst()} locations={activeLocationOptions(locations)} initial={initial} />
    </>
  );
}
