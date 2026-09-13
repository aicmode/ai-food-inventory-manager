import type { Metadata } from "next";
import {
  AlertOctagon,
  AlertTriangle,
  Boxes,
  CalendarClock,
  CalendarX2,
  PackageMinus,
  PackagePlus,
  PackageX,
  ShoppingCart,
  Tags,
  Trash2,
  TrendingUp,
  Wallet,
} from "lucide-react";
import Link from "next/link";

import { BarList, ColumnChart, LineChart } from "@/components/charts/charts";
import { ButtonLink } from "@/components/ui/button";
import {
  Alert,
  Badge,
  Card,
  CardBody,
  CardHeader,
  EmptyState,
  PageHeader,
  StatTile,
  TableContainer,
  td,
  tdRight,
  th,
  thRight,
  tr,
} from "@/components/ui/primitives";
import { requireOrgContext } from "@/lib/auth/context";
import { loadDashboardSummary } from "@/lib/data/dashboard";
import { isStockout, loadRecommendations, sortByUrgency } from "@/lib/data/recommendations";
import { formatCurrency, formatDate, formatDateTime, formatPercent, formatQuantity, todayJst } from "@/lib/format";
import {
  PO_STATUS_LABELS,
  PO_STATUS_TONES,
  RISK_LEVEL_LABELS,
  RISK_TONES,
  TRANSACTION_TYPE_LABELS,
  TRANSACTION_TYPE_TONES,
  label,
} from "@/lib/labels";
import type { RiskLevel } from "@/lib/domain/recommendation";
import { textParam } from "@/lib/search-params";

export const metadata: Metadata = { title: "ダッシュボード" };

const RISK_COLORS: Record<RiskLevel, string> = {
  low: "var(--status-good)",
  medium: "var(--status-warning)",
  high: "var(--status-serious)",
  critical: "var(--status-critical)",
};

const RISK_ICONS: Record<RiskLevel, string> = { low: "✓", medium: "!", high: "▲", critical: "■" };

export default async function DashboardPage({ searchParams }: PageProps<"/dashboard">) {
  const params = await searchParams;
  const context = await requireOrgContext();
  const [summary, recommendations] = await Promise.all([loadDashboardSummary(context), loadRecommendations(context)]);

  const stockoutProducts = new Set(recommendations.filter(isStockout).map((r) => r.row.product_id));
  const riskProducts = new Set(
    recommendations
      .filter((r) => !isStockout(r) && (r.result.shortageRisk === "high" || r.result.shortageRisk === "critical"))
      .map((r) => r.row.product_id),
  );
  const overstockProducts = new Set(recommendations.filter((r) => r.result.isOverstock).map((r) => r.row.product_id));
  const riskCounts: Record<RiskLevel, number> = { low: 0, medium: 0, high: 0, critical: 0 };
  for (const r of recommendations) riskCounts[r.result.shortageRisk] += 1;
  const top10 = sortByUrgency(recommendations.filter((r) => r.result.recommendedQuantity > 0)).slice(0, 10);
  const wasteRate =
    summary.wasteMonthQuantity + summary.outboundMonthQuantity > 0
      ? summary.wasteMonthQuantity / (summary.wasteMonthQuantity + summary.outboundMonthQuantity)
      : 0;
  const totalSkuForRate = summary.activeSkuCount || 1;

  return (
    <>
      <PageHeader
        title="ダッシュボード"
        description={`${formatDate(todayJst())} 時点の在庫・賞味期限・発注の状況`}
        actions={
          <ButtonLink href="/ai-orders">
            <TrendingUp className="size-4" aria-hidden="true" />
            AI発注提案を確認
          </ButtonLink>
        }
      />

      {textParam(params, "denied") ? (
        <div className="mb-4">
          <Alert tone="warning">アクセスしようとした画面を利用する権限がありません。管理者にロールの変更を依頼してください。</Alert>
        </div>
      ) : null}

      <section aria-label="主要指標" className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <StatTile label="総SKU数" value={summary.activeSkuCount.toLocaleString("ja-JP")} sub="有効な商品" icon={Tags} href="/products" />
        <StatTile label="総在庫数量" value={formatQuantity(summary.totalQuantity)} sub="全拠点合計" icon={Boxes} href="/inventory" />
        <StatTile label="総在庫金額" value={formatCurrency(summary.totalValue)} sub="ロット原価ベース" icon={Wallet} />
        <StatTile
          label="欠品商品数"
          value={stockoutProducts.size.toLocaleString("ja-JP")}
          sub={`SKUの${formatPercent(stockoutProducts.size / totalSkuForRate)}`}
          icon={PackageX}
          tone={stockoutProducts.size > 0 ? "critical" : "success"}
          href="/ai-orders?risk=critical"
        />
        <StatTile
          label="欠品リスク商品数"
          value={riskProducts.size.toLocaleString("ja-JP")}
          sub="リスク高・緊急"
          icon={AlertOctagon}
          tone={riskProducts.size > 0 ? "danger" : "success"}
          href="/ai-orders?risk=high"
        />
        <StatTile
          label="過剰在庫商品数"
          value={overstockProducts.size.toLocaleString("ja-JP")}
          sub={`在庫${context.organization.overstockDays}日分超など`}
          icon={Boxes}
          tone={overstockProducts.size > 0 ? "warning" : "success"}
          href="/ai-orders?view=overstock"
        />
        <StatTile
          label="賞味期限間近"
          value={`${summary.expiringSoonProductCount.toLocaleString("ja-JP")} 商品`}
          sub="アラート日数以内"
          icon={CalendarClock}
          tone={summary.expiringSoonProductCount > 0 ? "warning" : "success"}
          href="/inventory/lots?status=expiring_soon"
        />
        <StatTile
          label="期限切れ"
          value={`${summary.expiredProductCount.toLocaleString("ja-JP")} 商品`}
          sub={`${formatQuantity(summary.expiredQuantity)} 未廃棄`}
          icon={CalendarX2}
          tone={summary.expiredProductCount > 0 ? "danger" : "success"}
          href="/inventory/lots?status=expired"
        />
        <StatTile
          label="今月の廃棄額"
          value={formatCurrency(summary.wasteMonthAmount)}
          sub={`${formatQuantity(summary.wasteMonthQuantity)}・廃棄率 ${formatPercent(wasteRate)}`}
          icon={Trash2}
          href="/waste"
        />
        <StatTile
          label="未処理発注"
          value={`${summary.openPurchaseOrderCount.toLocaleString("ja-JP")} 件`}
          sub={`うち下書き ${summary.draftPurchaseOrderCount} 件`}
          icon={ShoppingCart}
          href="/purchase-orders?status=open"
        />
        <StatTile
          label="本日の入庫"
          value={formatQuantity(summary.todayReceiptQuantity)}
          sub={`${summary.todayReceiptCount} 伝票`}
          icon={PackagePlus}
          href="/receipts"
        />
        <StatTile
          label="本日の出庫"
          value={formatQuantity(summary.todayIssueQuantity)}
          sub={`${summary.todayIssueCount} 伝票（移動含む）`}
          icon={PackageMinus}
          href="/issues"
        />
      </section>

      <div className="mt-6 grid grid-cols-1 gap-6 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader title="30日間の入出庫推移" description="全拠点・数量ベース（入庫＝仕入入庫＋移動入庫、出庫＝販売＋使用＋移動出庫）" />
          <CardBody>
            <LineChart
              title="30日間の入出庫推移"
              data={summary.dailyFlow}
              xKey="date"
              unit="点"
              series={[
                { key: "inbound", label: "入庫", color: "var(--series-1)" },
                { key: "outbound", label: "出庫", color: "var(--series-2)" },
                { key: "waste", label: "廃棄", color: "var(--series-3)" },
              ]}
            />
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="欠品リスク" description="拠点×商品ごとの判定（決定論的ロジック）" />
          <CardBody>
            <BarList
              title="欠品リスク別の件数"
              valueFormat="count"
              items={(["critical", "high", "medium", "low"] as RiskLevel[]).map((level) => ({
                label: `${RISK_ICONS[level]} ${RISK_LEVEL_LABELS[level]}`,
                value: riskCounts[level],
                color: RISK_COLORS[level],
              }))}
            />
            <p className="mt-4 text-xs text-slate-500">
              緊急＝リードタイム内に欠品し入荷予定でも補えない、高＝リードタイム内に欠品または安全在庫以下、中＝発注点以下。
            </p>
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="カテゴリ別在庫金額" />
          <CardBody>
            <BarList
              title="カテゴリ別在庫金額"
              items={summary.categoryValues.slice(0, 10).map((c) => ({ label: c.name, value: c.value }))}
              valueFormat="currency"
            />
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="拠点別在庫" />
          <CardBody>
            <BarList
              title="拠点別在庫金額"
              items={summary.locationValues.map((l) => ({ label: l.name, value: l.value, sub: `（${formatQuantity(l.quantity)}）` }))}
              valueFormat="currency"
            />
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="廃棄金額の推移" description="直近6か月" />
          <CardBody>
            <ColumnChart
              title="月別廃棄金額"
              data={summary.wasteMonthly.map((m) => ({ label: `${Number(m.month.slice(5, 7))}月`, value: m.amount }))}
              valueFormat="currency"
            />
          </CardBody>
        </Card>
      </div>

      <div className="mt-6 grid grid-cols-1 gap-6 xl:grid-cols-2">
        <Card className="xl:col-span-2">
          <CardHeader
            title="AI発注候補 TOP10"
            description="欠品リスクと在庫日数から優先度順に表示"
            action={
              <Link href="/ai-orders" className="text-sm font-medium text-emerald-800 hover:underline">
                すべて見る
              </Link>
            }
          />
          {top10.length === 0 ? (
            <EmptyState title="現在、発注が必要な商品はありません" description="在庫と入荷予定で需要をまかなえています。" />
          ) : (
            <TableContainer caption="AI発注候補 TOP10">
              <thead>
                <tr>
                  <th scope="col" className={th}>商品</th>
                  <th scope="col" className={th}>拠点</th>
                  <th scope="col" className={thRight}>有効在庫</th>
                  <th scope="col" className={thRight}>在庫日数</th>
                  <th scope="col" className={thRight}>推奨数</th>
                  <th scope="col" className={th}>欠品リスク</th>
                  <th scope="col" className={th}>理由</th>
                </tr>
              </thead>
              <tbody>
                {top10.map(({ row, result, shortReason }) => (
                  <tr key={`${row.location_id}-${row.product_id}`} className={tr}>
                    <td className={td}>
                      <Link href={`/products/${row.product_id}`} className="font-medium text-slate-900 hover:underline">
                        {row.product_name}
                      </Link>
                      <p className="text-xs text-slate-500">{row.sku}</p>
                    </td>
                    <td className={`${td} whitespace-nowrap`}>{row.location_name}</td>
                    <td className={tdRight}>{formatQuantity(result.effectiveStock, row.sales_unit)}</td>
                    <td className={tdRight}>{result.daysOfStock === null ? "—" : `${result.daysOfStock}日`}</td>
                    <td className={`${tdRight} font-semibold`}>{formatQuantity(result.recommendedQuantity, row.sales_unit)}</td>
                    <td className={td}>
                      <Badge tone={RISK_TONES[result.shortageRisk]}>{RISK_LEVEL_LABELS[result.shortageRisk]}</Badge>
                    </td>
                    <td className={`${td} min-w-72 text-xs text-slate-600`}>{shortReason}</td>
                  </tr>
                ))}
              </tbody>
            </TableContainer>
          )}
        </Card>

        <Card>
          <CardHeader
            title="賞味期限間近の商品"
            action={
              <Link href="/inventory/lots?status=expiring_soon" className="text-sm font-medium text-emerald-800 hover:underline">
                ロット一覧
              </Link>
            }
          />
          {summary.expiringLots.length === 0 ? (
            <EmptyState icon={AlertTriangle} title="期限間近のロットはありません" />
          ) : (
            <TableContainer caption="賞味期限間近のロット">
              <thead>
                <tr>
                  <th scope="col" className={th}>賞味期限</th>
                  <th scope="col" className={th}>商品</th>
                  <th scope="col" className={th}>拠点</th>
                  <th scope="col" className={thRight}>残数</th>
                </tr>
              </thead>
              <tbody>
                {summary.expiringLots.map((lot) => (
                  <tr key={lot.id} className={tr}>
                    <td className={`${td} whitespace-nowrap`}>{formatDate(lot.expirationDate)}</td>
                    <td className={td}>
                      <Link href={`/products/${lot.productId}`} className="hover:underline">
                        {lot.productName}
                      </Link>
                    </td>
                    <td className={`${td} whitespace-nowrap`}>{lot.locationName}</td>
                    <td className={tdRight}>{formatQuantity(lot.quantity, lot.salesUnit)}</td>
                  </tr>
                ))}
              </tbody>
            </TableContainer>
          )}
        </Card>

        <Card>
          <CardHeader
            title="未着の発注"
            action={
              <Link href="/purchase-orders?status=open" className="text-sm font-medium text-emerald-800 hover:underline">
                発注一覧
              </Link>
            }
          />
          {summary.pendingPurchaseOrders.length === 0 ? (
            <EmptyState icon={ShoppingCart} title="未着の発注はありません" />
          ) : (
            <TableContainer caption="未着の発注">
              <thead>
                <tr>
                  <th scope="col" className={th}>納品予定</th>
                  <th scope="col" className={th}>発注番号</th>
                  <th scope="col" className={th}>仕入先 / 拠点</th>
                  <th scope="col" className={th}>状態</th>
                </tr>
              </thead>
              <tbody>
                {summary.pendingPurchaseOrders.map((po) => (
                  <tr key={po.id} className={tr}>
                    <td className={`${td} whitespace-nowrap`}>{formatDate(po.expectedDeliveryDate)}</td>
                    <td className={`${td} whitespace-nowrap`}>
                      <Link href={`/purchase-orders/${po.id}`} className="font-medium hover:underline">
                        {po.orderNumber}
                      </Link>
                    </td>
                    <td className={td}>
                      {po.supplierName}
                      <p className="text-xs text-slate-500">{po.locationName}</p>
                    </td>
                    <td className={td}>
                      <Badge tone={PO_STATUS_TONES[po.status] ?? "neutral"}>{label(PO_STATUS_LABELS, po.status)}</Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </TableContainer>
          )}
        </Card>

        <Card className="xl:col-span-2">
          <CardHeader
            title="最近の入出庫"
            action={
              <Link href="/inventory/transactions" className="text-sm font-medium text-emerald-800 hover:underline">
                履歴を見る
              </Link>
            }
          />
          {summary.recentTransactions.length === 0 ? (
            <EmptyState title="入出庫の履歴はまだありません" />
          ) : (
            <TableContainer caption="最近の入出庫">
              <thead>
                <tr>
                  <th scope="col" className={th}>日時</th>
                  <th scope="col" className={th}>区分</th>
                  <th scope="col" className={th}>商品</th>
                  <th scope="col" className={th}>拠点</th>
                  <th scope="col" className={thRight}>数量</th>
                </tr>
              </thead>
              <tbody>
                {summary.recentTransactions.map((t) => (
                  <tr key={t.id} className={tr}>
                    <td className={`${td} whitespace-nowrap`}>{formatDateTime(t.createdAt)}</td>
                    <td className={td}>
                      <Badge tone={TRANSACTION_TYPE_TONES[t.type] ?? "neutral"}>{label(TRANSACTION_TYPE_LABELS, t.type)}</Badge>
                    </td>
                    <td className={td}>
                      <Link href={`/products/${t.productId}`} className="hover:underline">
                        {t.productName}
                      </Link>
                    </td>
                    <td className={`${td} whitespace-nowrap`}>{t.locationName}</td>
                    <td className={tdRight}>
                      {t.quantity > 0 ? "+" : ""}
                      {formatQuantity(t.quantity, t.salesUnit)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </TableContainer>
          )}
        </Card>
      </div>
    </>
  );
}
