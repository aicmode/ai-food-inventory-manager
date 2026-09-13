import "server-only";

import { redirect } from "next/navigation";
import { cache } from "react";

import { hasPermission, isMemberRole, type MemberRole, type Permission } from "@/lib/domain/permissions";
import { createDataProvider } from "@/lib/data/provider";
import { logDbError } from "@/lib/errors";
import type { ServerSupabaseClient } from "@/lib/supabase/server";

export type OrgContext = {
  supabase: ServerSupabaseClient;
  isDemo: boolean;
  role: MemberRole;
  organization: {
    id: string;
    name: string;
    reviewPeriodDays: number;
    overstockDays: number;
    isDemoReadonly: boolean;
  };
};

/** JWT を検証してログインユーザーを取得（同一リクエスト内でキャッシュ） */
export const getAuthUser = cache(async () => {
  const provider = await createDataProvider();
  if (provider.mode === "demo") return { supabase: provider.client, userId: "10000000-0000-4000-8000-000000000002" };
  const supabase = provider.client;
  const { data, error } = await supabase.auth.getClaims();
  if (error || !data?.claims?.sub) return null;
  return { supabase, userId: data.claims.sub };
});

export const getOrgContext = cache(async (): Promise<OrgContext | null> => {
  const provider = await createDataProvider();
  if (provider.mode === "demo") {
    return {
      supabase: provider.client,
      isDemo: true,
      role: "owner",
      organization: {
        id: "10000000-0000-4000-8000-000000000001",
        name: "フレッシュマート ONE",
        reviewPeriodDays: 3,
        overstockDays: 45,
        isDemoReadonly: false,
      },
    };
  }
  const auth = await getAuthUser();
  if (!auth) return null;
  const { supabase, userId } = auth;

  const load = async () => {
    // SSR クライアントのセッション確認を並列実行すると、ログイン直後だけ同じ JWT の
    // 検証が競合して片方が PGRST303 になることがあるため、認証コンテキストは直列で読む。
    const membersResult = await supabase
      .from("organization_members")
      .select("organization_id, role, organizations(id, name, review_period_days, overstock_days, is_demo_readonly)")
      .eq("user_id", userId)
      .order("created_at");
    const profileResult = await supabase.from("profiles").select("is_demo").eq("id", userId).maybeSingle();
    return [membersResult, profileResult] as const;
  };

  let [membersResult, profileResult] = await load();
  // ログイン直後は Auth と DB の時計差で、発行直後の JWT が一時的に future 扱いになることがある。
  // 短い待機を挟んで最大3回だけ再取得し、初回導線に不要なエラー画面を出さない。
  for (let retry = 0; retry < 3; retry += 1) {
    const issuedInFuture = membersResult.error?.code === "PGRST303" || profileResult.error?.code === "PGRST303";
    if (!issuedInFuture) break;
    await new Promise((resolve) => setTimeout(resolve, 1000));
    [membersResult, profileResult] = await load();
  }

  if (membersResult.error) {
    logDbError("load memberships", membersResult.error);
    throw new Error("所属組織の読み込みに失敗しました。");
  }
  if (profileResult.error) {
    logDbError("load profile", profileResult.error);
    throw new Error("プロフィールの読み込みに失敗しました。");
  }

  const rows = membersResult.data.filter((row) => row.organizations !== null && isMemberRole(row.role));
  const memberships = rows.map((row) => ({
    role: row.role as MemberRole,
    org: row.organizations as NonNullable<(typeof rows)[number]["organizations"]>,
  }));

  // Client Production Modeでは認証済みユーザーの最初の所属組織を利用する。
  const active = memberships[0];
  if (!active) {
    return null;
  }

  return {
    supabase,
    isDemo: profileResult.data?.is_demo ?? false,
    role: active.role,
    organization: {
      id: active.org.id,
      name: active.org.name,
      reviewPeriodDays: active.org.review_period_days,
      overstockDays: active.org.overstock_days,
      isDemoReadonly: active.org.is_demo_readonly,
    },
  };
});

/** ページ用: production接続または所属組織が利用できなければ設定案内へ */
export async function requireOrgContext(): Promise<OrgContext> {
  const context = await getOrgContext();
  if (context) return context;
  redirect("/setup?reason=production-context");
}

/** ページ用: 権限がない場合は権限エラー画面を表示 */
export async function requirePagePermission(permission: Permission): Promise<OrgContext> {
  const context = await requireOrgContext();
  if (!hasPermission(context.role, permission)) {
    redirect("/dashboard?denied=1");
  }
  return context;
}

export type AuthorizeResult =
  | { ok: true; context: OrgContext }
  | { ok: false; message: string };

/**
 * Server Action 用の認証・認可チェック。
 * DB 側でも RLS / RPC 内のロール検証を行うため、ここは早期に分かりやすいエラーを返す役割。
 */
export async function authorizeAction(permission?: Permission): Promise<AuthorizeResult> {
  const context = await getOrgContext();
  if (!context) {
    return { ok: false, message: "データ環境を利用できません。接続設定を確認してください。" };
  }
  if (permission && !hasPermission(context.role, permission)) {
    return { ok: false, message: "この操作を行う権限がありません。" };
  }
  if (permission && context.organization.isDemoReadonly) {
    return { ok: false, message: "デモ環境は閲覧専用のため、この操作は実行できません。" };
  }
  return { ok: true, context };
}
