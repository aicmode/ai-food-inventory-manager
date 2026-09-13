import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { PageHeader } from "@/components/ui/primitives";
import { requirePagePermission } from "@/lib/auth/context";
import { logDbError } from "@/lib/errors";
import { isUuid } from "@/lib/search-params";

import { updateSupplierAction } from "../../actions";
import { SupplierForm } from "../../supplier-form";

export const metadata: Metadata = { title: "仕入先の編集" };

export default async function EditSupplierPage({ params }: PageProps<"/suppliers/[id]/edit">) {
  const { id } = await params;
  if (!isUuid(id)) notFound();
  const context = await requirePagePermission("master.manage");
  const { data, error } = await context.supabase.from("suppliers").select("*").eq("id", id).eq("organization_id", context.organization.id).maybeSingle();
  if (error) {
    logDbError("edit supplier load", error);
    throw new Error("仕入先の読み込みに失敗しました。");
  }
  if (!data) notFound();
  return (
    <>
      <PageHeader
        title="仕入先の編集"
        description={data.company_name}
        breadcrumbs={[
          { href: "/suppliers", label: "仕入先" },
          { href: `/suppliers/${data.id}`, label: data.code },
        ]}
      />
      <SupplierForm action={updateSupplierAction.bind(null, data.id)} defaults={data} submitLabel="保存する" cancelHref={`/suppliers/${data.id}`} />
    </>
  );
}
