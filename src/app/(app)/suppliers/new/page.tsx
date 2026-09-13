import type { Metadata } from "next";

import { PageHeader } from "@/components/ui/primitives";
import { requirePagePermission } from "@/lib/auth/context";

import { createSupplierAction } from "../actions";
import { SupplierForm } from "../supplier-form";

export const metadata: Metadata = { title: "仕入先の登録" };

export default async function NewSupplierPage() {
  await requirePagePermission("master.manage");
  return (
    <>
      <PageHeader title="仕入先の登録" breadcrumbs={[{ href: "/suppliers", label: "仕入先" }]} />
      <SupplierForm action={createSupplierAction} submitLabel="登録する" cancelHref="/suppliers" />
    </>
  );
}
