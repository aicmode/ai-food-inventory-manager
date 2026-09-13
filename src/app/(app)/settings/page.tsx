import type { Metadata } from "next";

import { Alert, Badge, Card, CardBody, CardHeader, PageHeader } from "@/components/ui/primitives";
import { requireOrgContext } from "@/lib/auth/context";
import { getCategories } from "@/lib/data/lookups";
import { hasPermission } from "@/lib/domain/permissions";
import { isAiConfigured } from "@/lib/ai/provider";
import { isDemoMode } from "@/lib/app-mode";

import { CategoryForm, OrganizationSettingsForm } from "./settings-forms";
import { DemoResetPanel } from "./demo-reset";

export const metadata: Metadata = { title: "設定" };

function aiStatusText(): string {
  if (isDemoMode()) return "販売デモでは外部AI APIを呼び出さず、決定論的なテンプレートで説明文を表示します。";
  return isAiConfigured() ? "AI API を使用して説明文を生成します。" : "AI API は未設定です。決定論的なテンプレートで説明文を表示します。";
}

export default async function SettingsPage() {
  const context = await requireOrgContext();
  const { organization } = context;
  const canManageOrg = hasPermission(context.role, "organization.manage") && !context.isDemo && !organization.isDemoReadonly;
  const canManageMaster = hasPermission(context.role, "master.manage") && !organization.isDemoReadonly;

  const categories = await getCategories(context.supabase, organization.id);
  const tops = categories.filter((c) => c.parent_id === null);

  return (
    <>
      <PageHeader title="設定" description="発注基準・カテゴリ・現在のシステム環境を確認します。" />
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        <Card>
          <CardHeader title="組織設定" description="AI発注提案の判定基準にも使われます。" />
          <CardBody className="space-y-3">
            {!canManageOrg ? (
              <Alert tone="info">販売デモでは組織名と発注基準を固定しています。</Alert>
            ) : null}
            <OrganizationSettingsForm
              disabled={!canManageOrg}
              defaults={{ name: organization.name, reviewPeriodDays: organization.reviewPeriodDays, overstockDays: organization.overstockDays }}
            />
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="システム状態" description="現在のデータ環境とAI説明の動作を確認できます。" />
          <CardBody className="space-y-3">
            <div className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-900">
              現在の環境: {isDemoMode() ? "販売デモ（固定サンプルデータ）" : "Client Production（専用データベース）"}
            </div>
            <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
              AI説明: {aiStatusText()}
            </div>
            <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
              データ保護: {isDemoMode() ? "外部データベースへ接続しません。本番導入時は専用DB・組織分離・RLS・業務RPCを利用できます。" : "組織分離・RLS・業務RPCによる整合性検証が有効です。"}
            </div>
            {isDemoMode() ? (
              <div id="demo-data" className="rounded-md border border-slate-200 p-3">
                <p className="text-sm font-semibold text-slate-900">デモデータ</p>
                <p className="mt-1 text-xs leading-5 text-slate-600">
                  固定seed 20260913のサンプルデータを全閲覧者で共通表示します。登録・更新などの疑似操作は共有データを変更せず、このブラウザ内だけに保持されます。
                </p>
                <div className="mt-3"><DemoResetPanel /></div>
              </div>
            ) : null}
          </CardBody>
        </Card>

        <Card className="xl:col-span-2">
          <CardHeader title="カテゴリ" description="大分類・小分類の2階層です。商品の絞り込みやダッシュボードの集計に使われます。" />
          {canManageMaster ? (
            <CardBody className="border-b border-slate-100">
              <CategoryForm parents={tops.map((top) => ({ value: top.id, label: top.name }))} />
            </CardBody>
          ) : null}
          <CardBody>
            <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {tops.map((top) => (
                <li key={top.id} className="rounded-md border border-slate-200 p-3">
                  <p className="text-sm font-semibold text-slate-900">
                    {top.name} <span className="text-xs font-normal text-slate-500">{top.code}</span>
                  </p>
                  <ul className="mt-1 flex flex-wrap gap-1">
                    {categories
                      .filter((c) => c.parent_id === top.id)
                      .map((sub) => (
                        <li key={sub.id}>
                          <Badge tone="neutral" icon={false}>
                            {sub.name}
                          </Badge>
                        </li>
                      ))}
                  </ul>
                </li>
              ))}
            </ul>
          </CardBody>
        </Card>
      </div>
    </>
  );
}
