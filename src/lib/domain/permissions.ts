/**
 * ロールと権限。UI の表示制御とサーバー側の事前チェックに使う。
 * 最終的な権限判定は DB（RLS・RPC 内のロール検証）で行う。
 */

export const MEMBER_ROLES = ["owner", "admin", "inventory_manager", "staff", "viewer"] as const;

export type MemberRole = (typeof MEMBER_ROLES)[number];

export type Permission =
  | "organization.manage"
  | "members.manage"
  | "locations.manage"
  | "master.manage"
  | "inventory.receive"
  | "inventory.issue"
  | "inventory.waste"
  | "inventory.quarantine"
  | "stocktake.manage"
  | "stocktake.count"
  | "purchase.manage"
  | "ai.explain";

const ROLE_PERMISSIONS: Record<MemberRole, readonly Permission[]> = {
  owner: [
    "organization.manage",
    "members.manage",
    "locations.manage",
    "master.manage",
    "inventory.receive",
    "inventory.issue",
    "inventory.waste",
    "inventory.quarantine",
    "stocktake.manage",
    "stocktake.count",
    "purchase.manage",
    "ai.explain",
  ],
  admin: [
    "organization.manage",
    "members.manage",
    "locations.manage",
    "master.manage",
    "inventory.receive",
    "inventory.issue",
    "inventory.waste",
    "inventory.quarantine",
    "stocktake.manage",
    "stocktake.count",
    "purchase.manage",
    "ai.explain",
  ],
  inventory_manager: [
    "master.manage",
    "inventory.receive",
    "inventory.issue",
    "inventory.waste",
    "inventory.quarantine",
    "stocktake.manage",
    "stocktake.count",
    "purchase.manage",
    "ai.explain",
  ],
  staff: ["inventory.receive", "inventory.issue", "stocktake.count", "ai.explain"],
  viewer: [],
};

export const ROLE_LABELS: Record<MemberRole, string> = {
  owner: "オーナー",
  admin: "管理者",
  inventory_manager: "在庫管理者",
  staff: "スタッフ",
  viewer: "閲覧者",
};

export function isMemberRole(value: unknown): value is MemberRole {
  return typeof value === "string" && (MEMBER_ROLES as readonly string[]).includes(value);
}

export function hasPermission(role: MemberRole | null | undefined, permission: Permission): boolean {
  if (!role) return false;
  return ROLE_PERMISSIONS[role].includes(permission);
}

/** 付与できるロール（管理者はオーナーを付与できない） */
export function assignableRoles(actor: MemberRole): MemberRole[] {
  if (actor === "owner") return [...MEMBER_ROLES];
  if (actor === "admin") return MEMBER_ROLES.filter((role) => role !== "owner");
  return [];
}

/**
 * 所属組織の中から、要求された組織 ID を安全に解決する。
 * cookie 等で渡された ID が所属外なら、所属組織の先頭にフォールバックする（他組織を参照させない）。
 */
export function resolveActiveOrganization<T extends { organizationId: string }>(
  memberships: T[],
  requestedId: string | null | undefined,
): T | null {
  if (memberships.length === 0) return null;
  if (requestedId) {
    const match = memberships.find((m) => m.organizationId === requestedId);
    if (match) return match;
  }
  return memberships[0];
}
