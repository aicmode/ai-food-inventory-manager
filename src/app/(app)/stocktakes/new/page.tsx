import type { Metadata } from "next";

import { PageHeader } from "@/components/ui/primitives";
import { requirePagePermission } from "@/lib/auth/context";
import { activeLocationOptions, categoryFilterOptions, getCategories, getLocations } from "@/lib/data/lookups";

import { StocktakeCreateForm } from "../stocktake-forms";

export const metadata: Metadata = { title: "棚卸の開始" };

export default async function NewStocktakePage() {
  const context = await requirePagePermission("stocktake.manage");
  const [locations, categories] = await Promise.all([
    getLocations(context.supabase, context.organization.id),
    getCategories(context.supabase, context.organization.id),
  ]);
  return (
    <>
      <PageHeader title="棚卸の開始" breadcrumbs={[{ href: "/stocktakes", label: "棚卸" }]} />
      <StocktakeCreateForm locations={activeLocationOptions(locations)} categories={categoryFilterOptions(categories)} />
    </>
  );
}
