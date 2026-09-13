import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { PageHeader } from "@/components/ui/primitives";
import { requirePagePermission } from "@/lib/auth/context";
import { getCategories, getSuppliers } from "@/lib/data/lookups";
import { logDbError } from "@/lib/errors";
import { isUuid } from "@/lib/search-params";

import { updateProductAction } from "../../actions";
import { ProductForm } from "../../product-form";

export const metadata: Metadata = { title: "商品の編集" };

export default async function EditProductPage({ params }: PageProps<"/products/[id]/edit">) {
  const { id } = await params;
  if (!isUuid(id)) notFound();
  const context = await requirePagePermission("master.manage");
  const [productResult, categories, suppliers] = await Promise.all([
    context.supabase.from("products").select("*").eq("id", id).eq("organization_id", context.organization.id).maybeSingle(),
    getCategories(context.supabase, context.organization.id),
    getSuppliers(context.supabase, context.organization.id),
  ]);
  if (productResult.error) {
    logDbError("edit product load", productResult.error);
    throw new Error("商品の読み込みに失敗しました。");
  }
  const product = productResult.data;
  if (!product) notFound();

  return (
    <>
      <PageHeader
        title="商品の編集"
        description={`${product.sku}　${product.product_name}`}
        breadcrumbs={[
          { href: "/products", label: "商品" },
          { href: `/products/${product.id}`, label: product.sku },
        ]}
      />
      <ProductForm
        action={updateProductAction.bind(null, product.id)}
        defaults={product}
        categories={categories}
        suppliers={suppliers
          .filter((s) => s.is_active || s.id === product.primary_supplier_id)
          .map((s) => ({ id: s.id, label: `${s.company_name}（${s.code}）` }))}
        submitLabel="保存する"
        cancelHref={`/products/${product.id}`}
      />
    </>
  );
}
