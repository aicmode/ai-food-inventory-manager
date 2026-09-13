import type { Metadata } from "next";

import { PageHeader } from "@/components/ui/primitives";
import { requirePagePermission } from "@/lib/auth/context";
import { getCategories, getSuppliers } from "@/lib/data/lookups";

import { createProductAction } from "../actions";
import { ProductForm } from "../product-form";

export const metadata: Metadata = { title: "商品の登録" };

export default async function NewProductPage() {
  const context = await requirePagePermission("master.manage");
  const [categories, suppliers] = await Promise.all([
    getCategories(context.supabase, context.organization.id),
    getSuppliers(context.supabase, context.organization.id),
  ]);

  return (
    <>
      <PageHeader title="商品の登録" breadcrumbs={[{ href: "/products", label: "商品" }]} />
      <ProductForm
        action={createProductAction}
        categories={categories}
        suppliers={suppliers.filter((s) => s.is_active).map((s) => ({ id: s.id, label: `${s.company_name}（${s.code}）` }))}
        submitLabel="登録する"
        cancelHref="/products"
      />
    </>
  );
}
