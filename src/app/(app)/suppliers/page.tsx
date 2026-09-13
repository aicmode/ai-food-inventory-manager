import type { Metadata } from "next";
import { Plus, Truck } from "lucide-react";
import Link from "next/link";

import { ButtonLink } from "@/components/ui/button";
import { FilterBar, FilterSelect, FilterText } from "@/components/ui/filter-bar";
import { Pagination, PAGE_SIZE, parsePage } from "@/components/ui/pagination";
import { Badge, Card, EmptyState, PageHeader, TableContainer, td, tdRight, th, thRight, tr } from "@/components/ui/primitives";
import { requireOrgContext } from "@/lib/auth/context";
import { hasPermission } from "@/lib/domain/permissions";
import { logDbError } from "@/lib/errors";
import { formatCurrency } from "@/lib/format";
import { enumParam, sanitizeFilterText, textParam } from "@/lib/search-params";

export const metadata: Metadata = { title: "仕入先" };

const ACTIVE = ["active", "inactive", "all"] as const;

export default async function SuppliersPage({ searchParams }: PageProps<"/suppliers">) {
  const params = await searchParams;
  const context = await requireOrgContext();
  const { supabase, organization } = context;
  const query = textParam(params, "q");
  const active = enumParam(params, "active", ACTIVE) ?? "active";
  const page = parsePage(params.page);

  let request = supabase
    .from("suppliers")
    .select("id, code, company_name, contact_name, phone, email, prefecture, city, payment_terms, minimum_order_amount, standard_lead_time_days, is_active, products(count)", { count: "exact" })
    .eq("organization_id", organization.id)
    .order("code")
    .range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1);
  if (active !== "all") request = request.eq("is_active", active === "active");
  if (query) {
    const text = sanitizeFilterText(query.normalize("NFKC"));
    if (text) request = request.or(`company_name.ilike.*${text}*,code.ilike.*${text}*,contact_name.ilike.*${text}*`);
  }
  const result = await request;
  if (result.error) {
    logDbError("suppliers list", result.error);
    throw new Error("仕入先の読み込みに失敗しました。");
  }
  const canManage = hasPermission(context.role, "master.manage") && !organization.isDemoReadonly;

  return (
    <>
      <PageHeader
        title="仕入先"
        description="発注先の会社情報・リードタイム・支払条件を管理します。"
        actions={
          canManage ? (
            <ButtonLink href="/suppliers/new">
              <Plus className="size-4" aria-hidden="true" />
              仕入先を登録
            </ButtonLink>
          ) : null
        }
      />
      <FilterBar basePath="/suppliers">
        <FilterText label="キーワード" name="q" value={query} placeholder="会社名・コード・担当者" />
        <FilterSelect
          label="状態"
          name="active"
          value={active}
          options={[
            { value: "active", label: "取引中のみ" },
            { value: "inactive", label: "無効のみ" },
            { value: "all", label: "すべて" },
          ]}
        />
      </FilterBar>
      <Card className="mt-4">
        {result.data.length === 0 ? (
          <EmptyState icon={Truck} title="条件に一致する仕入先はありません" action={canManage ? <ButtonLink href="/suppliers/new" variant="secondary">仕入先を登録</ButtonLink> : null} />
        ) : (
          <>
            <TableContainer caption="仕入先一覧">
              <thead>
                <tr>
                  <th scope="col" className={th}>コード</th>
                  <th scope="col" className={th}>会社名</th>
                  <th scope="col" className={th}>担当者・連絡先</th>
                  <th scope="col" className={th}>所在地</th>
                  <th scope="col" className={thRight}>リードタイム</th>
                  <th scope="col" className={thRight}>最低発注金額</th>
                  <th scope="col" className={thRight}>主要取扱商品</th>
                  <th scope="col" className={th}>状態</th>
                </tr>
              </thead>
              <tbody>
                {result.data.map((s) => (
                  <tr key={s.id} className={tr}>
                    <td className={`${td} font-mono text-xs whitespace-nowrap`}>{s.code}</td>
                    <td className={`${td} min-w-52`}>
                      <Link href={`/suppliers/${s.id}`} className="font-medium hover:underline">
                        {s.company_name}
                      </Link>
                      {s.payment_terms ? <p className="text-xs text-slate-500">{s.payment_terms}</p> : null}
                    </td>
                    <td className={`${td} text-xs`}>
                      {s.contact_name ?? "—"}
                      <p className="text-slate-500">{s.phone ?? s.email ?? ""}</p>
                    </td>
                    <td className={`${td} text-xs whitespace-nowrap`}>{[s.prefecture, s.city].filter(Boolean).join(" ") || "—"}</td>
                    <td className={tdRight}>{s.standard_lead_time_days}日</td>
                    <td className={tdRight}>{formatCurrency(s.minimum_order_amount)}</td>
                    <td className={tdRight}>{(s.products[0]?.count ?? 0).toLocaleString("ja-JP")}</td>
                    <td className={td}>{s.is_active ? <Badge tone="success">取引中</Badge> : <Badge tone="neutral">無効</Badge>}</td>
                  </tr>
                ))}
              </tbody>
            </TableContainer>
            <Pagination basePath="/suppliers" params={{ q: query, active }} page={page} total={result.count ?? 0} />
          </>
        )}
      </Card>
    </>
  );
}
