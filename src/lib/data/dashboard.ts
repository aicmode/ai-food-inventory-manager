import "server-only";

import type { OrgContext } from "@/lib/auth/context";
import { logDbError } from "@/lib/errors";

/** get_dashboard_summary の JSON を実行時に検証しながら型付きオブジェクトへ変換する */

type Obj = Record<string, unknown>;

const isObj = (value: unknown): value is Obj => typeof value === "object" && value !== null && !Array.isArray(value);
const num = (value: unknown): number => {
  const n = typeof value === "number" ? value : typeof value === "string" ? Number(value) : Number.NaN;
  return Number.isFinite(n) ? n : 0;
};
const str = (value: unknown): string => (typeof value === "string" ? value : "");
const strOrNull = (value: unknown): string | null => (typeof value === "string" ? value : null);
const list = (value: unknown): Obj[] => (Array.isArray(value) ? value.filter(isObj) : []);

export type DashboardSummary = {
  activeSkuCount: number;
  totalQuantity: number;
  totalValue: number;
  expiringSoonProductCount: number;
  expiredProductCount: number;
  expiredQuantity: number;
  wasteMonthQuantity: number;
  wasteMonthAmount: number;
  outboundMonthQuantity: number;
  openPurchaseOrderCount: number;
  draftPurchaseOrderCount: number;
  todayReceiptCount: number;
  todayReceiptQuantity: number;
  todayIssueQuantity: number;
  todayIssueCount: number;
  dailyFlow: { date: string; inbound: number; outbound: number; waste: number }[];
  categoryValues: { name: string; value: number }[];
  locationValues: { name: string; type: string; quantity: number; value: number }[];
  wasteMonthly: { month: string; amount: number; quantity: number }[];
  wasteByReason: { reason: string; amount: number; quantity: number }[];
  expiringLots: {
    id: string;
    lotNumber: string;
    expirationDate: string;
    quantity: number;
    productId: string;
    sku: string;
    productName: string;
    salesUnit: string;
    locationName: string;
  }[];
  recentTransactions: {
    id: string;
    type: string;
    quantity: number;
    createdAt: string;
    productId: string;
    sku: string;
    productName: string;
    salesUnit: string;
    locationName: string;
  }[];
  pendingPurchaseOrders: {
    id: string;
    orderNumber: string;
    status: string;
    orderDate: string;
    expectedDeliveryDate: string | null;
    totalAmount: number;
    supplierName: string;
    locationName: string;
  }[];
};

export async function loadDashboardSummary(context: OrgContext): Promise<DashboardSummary> {
  const { data, error } = await context.supabase.rpc("get_dashboard_summary", {
    p_organization_id: context.organization.id,
  });
  if (error || !isObj(data)) {
    logDbError("get_dashboard_summary", error);
    throw new Error("ダッシュボードの集計に失敗しました。");
  }
  const d = data;
  return {
    activeSkuCount: num(d.active_sku_count),
    totalQuantity: num(d.total_quantity),
    totalValue: num(d.total_value),
    expiringSoonProductCount: num(d.expiring_soon_product_count),
    expiredProductCount: num(d.expired_product_count),
    expiredQuantity: num(d.expired_quantity),
    wasteMonthQuantity: num(d.waste_month_quantity),
    wasteMonthAmount: num(d.waste_month_amount),
    outboundMonthQuantity: num(d.outbound_month_quantity),
    openPurchaseOrderCount: num(d.open_purchase_order_count),
    draftPurchaseOrderCount: num(d.draft_purchase_order_count),
    todayReceiptCount: num(d.today_receipt_count),
    todayReceiptQuantity: num(d.today_receipt_quantity),
    todayIssueQuantity: num(d.today_issue_quantity),
    todayIssueCount: num(d.today_issue_count),
    dailyFlow: list(d.daily_flow).map((r) => ({
      date: str(r.date).slice(0, 10),
      inbound: num(r.inbound),
      outbound: num(r.outbound),
      waste: num(r.waste),
    })),
    categoryValues: list(d.category_values).map((r) => ({ name: str(r.name), value: num(r.value) })),
    locationValues: list(d.location_values).map((r) => ({
      name: str(r.name),
      type: str(r.type),
      quantity: num(r.quantity),
      value: num(r.value),
    })),
    wasteMonthly: list(d.waste_monthly).map((r) => ({ month: str(r.month), amount: num(r.amount), quantity: num(r.quantity) })),
    wasteByReason: list(d.waste_by_reason).map((r) => ({ reason: str(r.reason), amount: num(r.amount), quantity: num(r.quantity) })),
    expiringLots: list(d.expiring_lots).map((r) => ({
      id: str(r.id),
      lotNumber: str(r.lot_number),
      expirationDate: str(r.expiration_date),
      quantity: num(r.quantity_remaining),
      productId: str(r.product_id),
      sku: str(r.sku),
      productName: str(r.product_name),
      salesUnit: str(r.sales_unit),
      locationName: str(r.location_name),
    })),
    recentTransactions: list(d.recent_transactions).map((r) => ({
      id: str(r.id),
      type: str(r.transaction_type),
      quantity: num(r.quantity),
      createdAt: str(r.created_at),
      productId: str(r.product_id),
      sku: str(r.sku),
      productName: str(r.product_name),
      salesUnit: str(r.sales_unit),
      locationName: str(r.location_name),
    })),
    pendingPurchaseOrders: list(d.pending_purchase_orders).map((r) => ({
      id: str(r.id),
      orderNumber: str(r.order_number),
      status: str(r.status),
      orderDate: str(r.order_date),
      expectedDeliveryDate: strOrNull(r.expected_delivery_date),
      totalAmount: num(r.total_amount),
      supplierName: str(r.supplier_name),
      locationName: str(r.location_name),
    })),
  };
}
