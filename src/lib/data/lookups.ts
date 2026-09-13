import "server-only";

import { cache } from "react";

import { logDbError } from "@/lib/errors";
import type { ServerSupabaseClient } from "@/lib/supabase/server";

/** フォームのセレクトや絞り込みで使うマスタ（1リクエスト内でキャッシュ） */

export type LocationOption = { id: string; code: string; name: string; type: "store" | "warehouse"; is_active: boolean };
export type SupplierOption = { id: string; code: string; company_name: string; is_active: boolean; standard_lead_time_days: number };
export type CategoryOption = { id: string; code: string; name: string; parent_id: string | null; sort_order: number };

export const getLocations = cache(async (supabase: ServerSupabaseClient, organizationId: string): Promise<LocationOption[]> => {
  const { data, error } = await supabase
    .from("locations")
    .select("id, code, name, type, is_active")
    .eq("organization_id", organizationId)
    .order("type", { ascending: true })
    .order("code");
  if (error) {
    logDbError("lookups.locations", error);
    throw new Error("拠点の読み込みに失敗しました。");
  }
  return data;
});

export const getSuppliers = cache(async (supabase: ServerSupabaseClient, organizationId: string): Promise<SupplierOption[]> => {
  const { data, error } = await supabase
    .from("suppliers")
    .select("id, code, company_name, is_active, standard_lead_time_days")
    .eq("organization_id", organizationId)
    .order("code")
    .limit(1000);
  if (error) {
    logDbError("lookups.suppliers", error);
    throw new Error("仕入先の読み込みに失敗しました。");
  }
  return data;
});

export const getCategories = cache(async (supabase: ServerSupabaseClient, organizationId: string): Promise<CategoryOption[]> => {
  const { data, error } = await supabase
    .from("categories")
    .select("id, code, name, parent_id, sort_order")
    .eq("organization_id", organizationId)
    .order("sort_order")
    .limit(1000);
  if (error) {
    logDbError("lookups.categories", error);
    throw new Error("カテゴリの読み込みに失敗しました。");
  }
  return data;
});

/** 絞り込み用: 大分類と「大分類 › 小分類」を並べた選択肢 */
export function categoryFilterOptions(categories: CategoryOption[]): { value: string; label: string }[] {
  const tops = categories.filter((c) => c.parent_id === null);
  return tops.flatMap((top) => [
    { value: top.id, label: top.name },
    ...categories.filter((c) => c.parent_id === top.id).map((sub) => ({ value: sub.id, label: `${top.name} › ${sub.name}` })),
  ]);
}

export function activeLocationOptions(locations: LocationOption[]) {
  return locations.filter((l) => l.is_active).map((l) => ({ value: l.id, label: l.name }));
}
