"use server";

import { authorizeAction } from "@/lib/auth/context";
import { logDbError } from "@/lib/errors";
import { todayJst } from "@/lib/format";
import { isUuid } from "@/lib/search-params";
import type { ActionResult } from "@/lib/validation/common";

export type StockInfo = {
  onHand: number;
  available: number;
  lots: {
    id: string;
    lotNumber: string;
    expirationDate: string | null;
    quantity: number;
    status: string;
    expired: boolean;
  }[];
};

/** 入出庫・廃棄フォーム用: 拠点×商品の在庫とロット（FEFO順） */
export async function getStockInfoAction(locationId: string, productId: string): Promise<ActionResult<StockInfo>> {
  const auth = await authorizeAction();
  if (!auth.ok) return auth;
  if (!isUuid(locationId) || !isUuid(productId)) return { ok: false, message: "拠点と商品を選択してください。" };
  const { supabase, organization } = auth.context;

  const [balance, lots] = await Promise.all([
    supabase
      .from("inventory_balances")
      .select("quantity_on_hand, quantity_available")
      .eq("organization_id", organization.id)
      .eq("location_id", locationId)
      .eq("product_id", productId)
      .maybeSingle(),
    supabase
      .from("inventory_lots")
      .select("id, lot_number, expiration_date, quantity_remaining, status")
      .eq("organization_id", organization.id)
      .eq("location_id", locationId)
      .eq("product_id", productId)
      .gt("quantity_remaining", 0)
      .order("expiration_date", { ascending: true, nullsFirst: false })
      .order("received_date")
      .limit(50),
  ]);
  if (balance.error || lots.error) {
    logDbError("stock info", balance.error ?? lots.error);
    return { ok: false, message: "在庫情報を取得できませんでした。" };
  }
  const today = todayJst();
  return {
    ok: true,
    message: "",
    data: {
      onHand: balance.data?.quantity_on_hand ?? 0,
      available: balance.data?.quantity_available ?? 0,
      lots: lots.data.map((lot) => ({
        id: lot.id,
        lotNumber: lot.lot_number,
        expirationDate: lot.expiration_date,
        quantity: lot.quantity_remaining,
        status: lot.status,
        expired: lot.expiration_date !== null && lot.expiration_date < today,
      })),
    },
  };
}
