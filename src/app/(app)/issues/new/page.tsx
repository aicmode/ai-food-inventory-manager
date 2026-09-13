import type { Metadata } from "next";

import { PageHeader } from "@/components/ui/primitives";
import { requirePagePermission } from "@/lib/auth/context";
import { activeLocationOptions, getLocations } from "@/lib/data/lookups";

import { IssueForm } from "../issue-form";

export const metadata: Metadata = { title: "出庫・移動の登録" };

export default async function NewIssuePage() {
  const context = await requirePagePermission("inventory.issue");
  const locations = await getLocations(context.supabase, context.organization.id);

  return (
    <>
      <PageHeader
        title="出庫・移動の登録"
        description="販売・店内使用による出庫、または拠点間の在庫移動を登録します。"
        breadcrumbs={[{ href: "/issues", label: "出庫・移動" }]}
      />
      <IssueForm locations={activeLocationOptions(locations)} />
    </>
  );
}
