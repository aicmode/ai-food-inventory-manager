import type { Metadata } from "next";
import { AlertOctagon, Info, PackageCheck, Recycle, Sparkles, Wallet } from "lucide-react";

import { Pagination, parsePage } from "@/components/ui/pagination";
import { Alert, Card, EmptyState, PageHeader, StatTile } from "@/components/ui/primitives";
import { FilterBar, FilterSelect, FilterText } from "@/components/ui/filter-bar";
import { requireOrgContext } from "@/lib/auth/context";
import { isAiConfigured } from "@/lib/ai/provider";
import { activeLocationOptions, getCategories, getLocations, getSuppliers } from "@/lib/data/lookups";
import { loadRecommendations, sortByUrgency } from "@/lib/data/recommendations";
import { hasPermission } from "@/lib/domain/permissions";
import { RISK_ORDER, type RiskLevel } from "@/lib/domain/recommendation";
import { formatCurrency, normalizeSearchQuery } from "@/lib/format";
import { RISK_LEVEL_LABELS } from "@/lib/labels";
import { enumParam, textParam, uuidParam } from "@/lib/search-params";

import { RecommendationTable, type RecommendationView } from "./recommendation-table";

export const metadata: Metadata = { title: "AI発注提案" };

const VIEWS = ["recommended", "all", "overstock", "waste"] as const;
const RISKS = ["critical", "high", "medium", "low"] as const;
const PAGE_SIZE = 100;

export default async function AiOrdersPage({ searchParams }: PageProps<"/ai-orders">) {
  const params = await searchParams;
  const context = await requireOrgContext();
  const { supabase, organization } = context;
  const [locations, suppliers, categories] = await Promise.all([
    getLocations(supabase, organization.id),
    getSuppliers(supabase, organization.id),
    getCategories(supabase, organization.id),
  ]);
  const activeLocations = locations.filter((l) => l.is_active);
  const requestedLocation = uuidParam(params, "location");
  const location =
    activeLocations.find((l) => l.id === requestedLocation) ?? activeLocations.find((l) => l.type === "store") ?? activeLocations[0];

  const view = enumParam(params, "view", VIEWS) ?? "recommended";
  const risk = enumParam(params, "risk", RISKS);
  const supplierId = uuidParam(params, "supplier");
  const categoryId = uuidParam(params, "category");
  const query = textParam(params, "q");
  const page = parsePage(params.page);

  if (!location) {
    return (
      <>
        <PageHeader title="AI発注提案" />
        <Card>
          <EmptyState title="有効な拠点がありません" description="拠点を登録すると、拠点ごとの発注提案を表示できます。" />
        </Card>
      </>
    );
  }

  const all = await loadRecommendations(context, { locationId: location.id });
  const categoryName = categoryId ? categories.find((c) => c.id === categoryId)?.name : undefined;
  const normalized = query ? normalizeSearchQuery(query) : null;

  const filtered = sortByUrgency(
    all.filter(({ row, result }) => {
      if (view === "recommended" && result.recommendedQuantity <= 0) return false;
      if (view === "overstock" && !result.isOverstock) return false;
      if (view === "waste" && RISK_ORDER[result.wasteRisk] < RISK_ORDER.high) return false;
      if (risk && result.shortageRisk !== risk) return false;
      if (supplierId && row.supplier_id !== supplierId) return false;
      if (categoryName && row.category_name !== categoryName) return false;
      if (normalized) {
        const haystack = `${row.sku} ${row.jan_code ?? ""} ${row.product_name}`.toLowerCase();
        const needle = normalized.primary.toLowerCase();
        if (!haystack.includes(needle) && !(normalized.kana && haystack.includes(normalized.kana.toLowerCase()))) return false;
      }
      return true;
    }),
  );

  const recommended = all.filter((r) => r.result.recommendedQuantity > 0);
  const recommendedAmount = recommended.reduce((sum, r) => sum + r.result.recommendedQuantity * r.row.cost_price, 0);
  const criticalCount = all.filter((r) => r.result.shortageRisk === "critical").length;
  const wasteHighCount = all.filter((r) => RISK_ORDER[r.result.wasteRisk] >= RISK_ORDER.high).length;

  const pageRows = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const rows: RecommendationView[] = pageRows.map(({ row, result, shortReason }) => ({
    key: `${row.location_id}:${row.product_id}`,
    productId: row.product_id,
    sku: row.sku,
    productName: row.product_name,
    categoryName: row.category_name,
    unit: row.sales_unit,
    supplierName: row.supplier_name,
    hasSupplier: Boolean(row.supplier_id),
    onHand: row.quantity_on_hand,
    available: result.availableStock,
    usable: result.usableStock,
    safetyStock: row.safety_stock,
    reorderPoint: row.reorder_point,
    average7d: result.average7d,
    average30d: result.average30d,
    incoming: row.incoming_quantity,
    nextDeliveryDate: row.next_delivery_date,
    stockoutDate: result.stockoutDate,
    daysOfStock: result.daysOfStock,
    recommendedQuantity: result.recommendedQuantity,
    orderLotSize: row.order_lot_size,
    minimumOrderQuantity: row.minimum_order_quantity,
    unitCost: row.cost_price,
    shortageRisk: result.shortageRisk,
    wasteRisk: result.wasteRisk,
    isOverstock: result.isOverstock,
    reason: shortReason,
  }));

  const filterParams = {
    location: location.id,
    view,
    risk,
    supplier: supplierId,
    category: categoryId,
    q: query,
  };
  const canOrder = hasPermission(context.role, "purchase.manage") && !organization.isDemoReadonly;

  return (
    <>
      <PageHeader
        title="AI発注提案"
        description="発注すべき商品を、在庫状況と消費ペースから自動判定"
      />

      <div className="mb-4">
        <Alert tone="info" title="数量の決め方">
          推奨数は、直近7日・30日の出庫平均、曜日傾向、リードタイム＋発注サイクル（{organization.reviewPeriodDays}日）、安全在庫、発注点、入荷予定、期限切れ・消化不能在庫、廃棄傾向、発注単位・最小発注数量から
          <strong className="font-semibold">決定論的に計算</strong>しています。
          {isAiConfigured() ? "「説明」では AI が計算結果を文章で解説します（数量は変更しません）。" : "「説明」では計算結果を定型文で解説します（AI API 未設定）。"}
        </Alert>
      </div>

      <FilterBar basePath="/ai-orders">
        <FilterSelect label="拠点" name="location" value={location.id} options={activeLocationOptions(locations)} />
        <FilterSelect
          label="表示"
          name="view"
          value={view}
          options={[
            { value: "recommended", label: "発注推奨のみ" },
            { value: "all", label: "すべての商品" },
            { value: "overstock", label: "過剰在庫" },
            { value: "waste", label: "廃棄リスク高" },
          ]}
        />
        <FilterSelect
          label="欠品リスク"
          name="risk"
          value={risk}
          placeholder="すべて"
          options={RISKS.map((level) => ({ value: level, label: RISK_LEVEL_LABELS[level as RiskLevel] }))}
        />
        <FilterSelect
          label="仕入先"
          name="supplier"
          value={supplierId}
          placeholder="すべて"
          options={suppliers.map((s) => ({ value: s.id, label: s.company_name }))}
        />
        <FilterSelect
          label="カテゴリ"
          name="category"
          value={categoryId}
          placeholder="すべて"
          options={categories.filter((c) => c.parent_id === null).map((c) => ({ value: c.id, label: c.name }))}
        />
        <FilterText label="商品検索" name="q" value={query} placeholder="SKU・JAN・商品名" />
      </FilterBar>

      <section aria-label="提案サマリー" className="my-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile label="発注推奨の商品" value={`${recommended.length.toLocaleString("ja-JP")} 品目`} sub={`${location.name}・判定対象 ${all.length} 品目`} icon={PackageCheck} />
        <StatTile label="推奨どおり発注した場合" value={formatCurrency(recommendedAmount)} sub="税抜・仕入単価ベース" icon={Wallet} />
        <StatTile label="欠品リスク 緊急" value={`${criticalCount} 品目`} tone={criticalCount > 0 ? "critical" : "success"} icon={AlertOctagon} />
        <StatTile label="廃棄リスク 高以上" value={`${wasteHighCount} 品目`} tone={wasteHighCount > 0 ? "warning" : "success"} icon={Recycle} />
      </section>

      <Card>
        {rows.length === 0 ? (
          <EmptyState
            icon={view === "recommended" ? Sparkles : Info}
            title={view === "recommended" ? "現在、発注が必要な商品はありません" : "条件に一致する商品はありません"}
            description="絞り込み条件を変更するか、表示を「すべての商品」にしてください。"
          />
        ) : (
          <>
            <RecommendationTable locationId={location.id} locationName={location.name} rows={rows} canOrder={canOrder} />
            <Pagination basePath="/ai-orders" params={filterParams} page={page} pageSize={PAGE_SIZE} total={filtered.length} />
          </>
        )}
      </Card>
    </>
  );
}
