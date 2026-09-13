"use client";

import { Bot, FileText, Loader2, ShoppingCart } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Fragment, useId, useMemo, useRef, useState, useTransition } from "react";

import { buttonClasses } from "@/components/ui/button";
import { Badge } from "@/components/ui/primitives";
import { useToast } from "@/components/ui/toast";
import type { Explanation } from "@/lib/ai/provider";
import { demoSuccessMessage, recordDemoOperation } from "@/lib/app-mode";
import { isValidOrderQuantity, type RiskLevel } from "@/lib/domain/recommendation";
import { RISK_LEVEL_LABELS, RISK_TONES } from "@/lib/labels";

import { createOrdersFromRecommendationsAction, explainRecommendationAction } from "./actions";

export type RecommendationView = {
  key: string;
  productId: string;
  sku: string;
  productName: string;
  categoryName: string | null;
  unit: string;
  supplierName: string | null;
  hasSupplier: boolean;
  onHand: number;
  available: number;
  usable: number;
  safetyStock: number;
  reorderPoint: number;
  average7d: number;
  average30d: number;
  incoming: number;
  nextDeliveryDate: string | null;
  stockoutDate: string | null;
  daysOfStock: number | null;
  recommendedQuantity: number;
  orderLotSize: number;
  minimumOrderQuantity: number;
  unitCost: number;
  shortageRisk: RiskLevel;
  wasteRisk: RiskLevel;
  isOverstock: boolean;
  reason: string;
};

const qf = new Intl.NumberFormat("ja-JP", { maximumFractionDigits: 2 });
const yen = new Intl.NumberFormat("ja-JP", { style: "currency", currency: "JPY", maximumFractionDigits: 0 });
const date = (value: string | null) => (value ? value.replaceAll("-", "/") : "—");

export function RecommendationTable({
  locationId,
  locationName,
  rows,
  canOrder,
}: {
  locationId: string;
  locationName: string;
  rows: RecommendationView[];
  canOrder: boolean;
}) {
  const selectable = useMemo(() => rows.filter((r) => r.hasSupplier), [rows]);
  const [selected, setSelected] = useState<Set<string>>(
    () => new Set(rows.filter((r) => r.hasSupplier && r.recommendedQuantity > 0).map((r) => r.key)),
  );
  const [quantities, setQuantities] = useState<Record<string, string>>(() =>
    Object.fromEntries(rows.map((r) => [r.key, r.recommendedQuantity > 0 ? String(r.recommendedQuantity) : String(r.orderLotSize)])),
  );
  const [pending, startTransition] = useTransition();
  const [explaining, setExplaining] = useState<RecommendationView | null>(null);
  const router = useRouter();
  const toast = useToast();

  const invalidKeys = new Set(
    rows
      .filter((r) => selected.has(r.key))
      .filter((r) => !isValidOrderQuantity(Number(quantities[r.key]), { minimumOrderQuantity: r.minimumOrderQuantity, orderLotSize: r.orderLotSize }))
      .map((r) => r.key),
  );
  const selectedRows = rows.filter((r) => selected.has(r.key));
  const selectedAmount = selectedRows.reduce((sum, r) => sum + (Number(quantities[r.key]) || 0) * r.unitCost, 0);
  const supplierCount = new Set(selectedRows.map((r) => r.supplierName)).size;
  const allSelected = selectable.length > 0 && selectable.every((r) => selected.has(r.key));

  function toggle(key: string, checked: boolean) {
    setSelected((current) => {
      const next = new Set(current);
      if (checked) next.add(key);
      else next.delete(key);
      return next;
    });
  }

  function submit() {
    if (selectedRows.length === 0) {
      toast.error("発注する商品を選択してください。");
      return;
    }
    if (invalidKeys.size > 0) {
      toast.error("発注数が発注単位・最小発注数量に合っていない商品があります。赤枠の数量を修正してください。");
      return;
    }
    startTransition(async () => {
      try {
        const result = await createOrdersFromRecommendationsAction({
          location_id: locationId,
          items: selectedRows.map((r) => ({
            product_id: r.productId,
            ordered_quantity: Number(quantities[r.key]),
            ai_recommended_quantity: r.recommendedQuantity,
            ai_reason: r.reason,
          })),
        });
        if (result.ok) {
          recordDemoOperation(result.message);
          toast.success(demoSuccessMessage(result.message));
          router.push(result.redirectTo ?? "/purchase-orders");
        } else {
          toast.error(result.message);
        }
      } catch (error) {
        console.error("[ai-orders] create orders failed", error);
        toast.error("通信に失敗しました。もう一度お試しください。");
      }
    });
  }

  const quantityInput = (r: RecommendationView, extraClass = "") => (
    <input
      type="number"
      name={`quantity[${r.key}]`}
      inputMode="decimal"
      min={0}
      step={r.orderLotSize}
      value={quantities[r.key] ?? ""}
      onChange={(event) => setQuantities((current) => ({ ...current, [r.key]: event.target.value }))}
      aria-label={`${r.productName}の発注数`}
      aria-invalid={invalidKeys.has(r.key)}
      disabled={!canOrder || !r.hasSupplier}
      className={`w-24 rounded-md border px-2 py-1 text-right text-sm tabular ${
        invalidKeys.has(r.key) ? "border-red-500 bg-red-50" : "border-slate-300"
      } disabled:bg-slate-100 ${extraClass}`}
    />
  );

  return (
    <div>
      {canOrder ? (
        <div className="sticky top-14 z-20 flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 bg-white/95 px-4 py-3 backdrop-blur">
          <p className="text-sm text-slate-700" aria-live="polite">
            <span className="font-semibold text-slate-900">{selectedRows.length}</span> 品目を選択中
            {selectedRows.length > 0 ? (
              <span className="text-slate-500">
                （仕入先 {supplierCount} 社・概算 {yen.format(selectedAmount)}）
              </span>
            ) : null}
          </p>
          <button type="button" onClick={submit} disabled={pending || selectedRows.length === 0} className={buttonClasses("primary")}>
            {pending ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : <ShoppingCart className="size-4" aria-hidden="true" />}
            {pending ? "作成中…" : "選択商品から発注書を作成"}
          </button>
        </div>
      ) : (
        <p className="border-b border-slate-200 px-4 py-3 text-xs text-slate-600">発注書の作成は在庫管理者以上のロールで行えます。</p>
      )}

      {/* デスクトップ: テーブル */}
      <div className="hidden overflow-x-auto md:block">
        <table className="min-w-full text-sm">
          <caption className="sr-only">{locationName}の発注提案</caption>
          <thead className="bg-slate-50 text-xs text-slate-600">
            <tr>
              <th scope="col" className="px-3 py-2 text-left">
                {canOrder ? (
                  <input
                    type="checkbox"
                    name="selectAllProducts"
                    checked={allSelected}
                    onChange={(event) => setSelected(event.target.checked ? new Set(selectable.map((r) => r.key)) : new Set())}
                    aria-label="表示中の商品をすべて選択"
                    className="size-4"
                  />
                ) : (
                  <span className="sr-only">選択</span>
                )}
              </th>
              <th scope="col" className="px-3 py-2 text-left font-semibold whitespace-nowrap">商品 / SKU</th>
              <th scope="col" className="px-3 py-2 text-right font-semibold whitespace-nowrap">現在庫 / 利用可能</th>
              <th scope="col" className="px-3 py-2 text-right font-semibold whitespace-nowrap">安全在庫 / 発注点</th>
              <th scope="col" className="px-3 py-2 text-right font-semibold whitespace-nowrap">7日平均 / 30日平均</th>
              <th scope="col" className="px-3 py-2 text-right font-semibold whitespace-nowrap">入荷予定</th>
              <th scope="col" className="px-3 py-2 text-left font-semibold whitespace-nowrap">欠品予測日</th>
              <th scope="col" className="px-3 py-2 text-right font-semibold whitespace-nowrap">推奨数</th>
              <th scope="col" className="px-3 py-2 text-right font-semibold whitespace-nowrap">発注数</th>
              <th scope="col" className="px-3 py-2 text-left font-semibold whitespace-nowrap">欠品 / 廃棄リスク</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <Fragment key={r.key}>
              <tr className={`border-t border-slate-100 align-top ${selected.has(r.key) ? "bg-emerald-50/40" : ""}`}>
                <td className="px-3 py-2">
                  {canOrder ? (
                    <input
                      type="checkbox"
                      name="selectedProduct"
                      value={r.key}
                      checked={selected.has(r.key)}
                      disabled={!r.hasSupplier}
                      onChange={(event) => toggle(r.key, event.target.checked)}
                      aria-label={`${r.productName}を選択`}
                      className="size-4"
                    />
                  ) : null}
                </td>
                <td className="min-w-52 px-3 py-2">
                  <Link href={`/products/${r.productId}`} className="font-medium text-slate-900 hover:underline">
                    {r.productName}
                  </Link>
                  <p className="text-xs text-slate-500">
                    {r.sku}・{r.supplierName ?? "仕入先未設定"}
                  </p>
                </td>
                <td className="px-3 py-2 text-right whitespace-nowrap tabular">
                  {qf.format(r.onHand)} / {qf.format(r.available)}
                  {r.usable < r.available ? <p className="text-xs text-slate-500">販売可 {qf.format(r.usable)}</p> : null}
                </td>
                <td className="px-3 py-2 text-right whitespace-nowrap tabular">
                  {qf.format(r.safetyStock)} / {qf.format(r.reorderPoint)}
                </td>
                <td className="px-3 py-2 text-right whitespace-nowrap tabular">
                  {qf.format(r.average7d)} / {qf.format(r.average30d)}
                </td>
                <td className="px-3 py-2 text-right whitespace-nowrap tabular">
                  {r.incoming > 0 ? qf.format(r.incoming) : "—"}
                  {r.nextDeliveryDate ? <p className="text-xs text-slate-500">{date(r.nextDeliveryDate)}</p> : null}
                </td>
                <td className="px-3 py-2 whitespace-nowrap tabular">
                  {date(r.stockoutDate)}
                  {r.daysOfStock !== null ? <p className="text-xs text-slate-500">約{qf.format(r.daysOfStock)}日分</p> : null}
                </td>
                <td className="px-3 py-2 text-right font-semibold whitespace-nowrap tabular">
                  {qf.format(r.recommendedQuantity)} {r.unit}
                  <p className="text-xs font-normal text-slate-500">単位 {qf.format(r.orderLotSize)}</p>
                </td>
                <td className="px-3 py-2 text-right">{quantityInput(r)}</td>
                <td className="px-3 py-2">
                  <div className="flex flex-col items-start gap-1">
                    <Badge tone={RISK_TONES[r.shortageRisk]}>欠品 {RISK_LEVEL_LABELS[r.shortageRisk]}</Badge>
                    <Badge tone={RISK_TONES[r.wasteRisk]}>廃棄 {RISK_LEVEL_LABELS[r.wasteRisk]}</Badge>
                  </div>
                </td>
              </tr>
              <tr className={selected.has(r.key) ? "bg-emerald-50/40" : ""}>
                <td />
                <td colSpan={9} className="px-3 pb-3 text-xs text-slate-700">
                  <span className="font-medium text-slate-500">推奨理由：</span>
                  {r.reason}
                  <button
                    type="button"
                    onClick={() => setExplaining(r)}
                    className="ml-2 inline-flex items-center gap-1 font-medium text-emerald-800 hover:underline"
                  >
                    <FileText className="size-3.5" aria-hidden="true" />
                    説明を見る
                  </button>
                </td>
              </tr>
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>

      {/* モバイル: カード */}
      <ul className="divide-y divide-slate-100 md:hidden">
        {rows.map((r) => (
          <li key={r.key} className={`px-4 py-3 ${selected.has(r.key) ? "bg-emerald-50/40" : ""}`}>
            <div className="flex items-start gap-3">
              {canOrder ? (
                <input
                  type="checkbox"
                  name="selectedProduct"
                  value={r.key}
                  checked={selected.has(r.key)}
                  disabled={!r.hasSupplier}
                  onChange={(event) => toggle(r.key, event.target.checked)}
                  aria-label={`${r.productName}を選択`}
                  className="mt-1 size-4"
                />
              ) : null}
              <div className="min-w-0 flex-1">
                <Link href={`/products/${r.productId}`} className="font-medium text-slate-900">
                  {r.productName}
                </Link>
                <p className="text-xs text-slate-500">
                  {r.sku}・{r.supplierName ?? "仕入先未設定"}
                </p>
                <div className="mt-2 flex flex-wrap gap-1">
                  <Badge tone={RISK_TONES[r.shortageRisk]}>欠品 {RISK_LEVEL_LABELS[r.shortageRisk]}</Badge>
                  <Badge tone={RISK_TONES[r.wasteRisk]}>廃棄 {RISK_LEVEL_LABELS[r.wasteRisk]}</Badge>
                </div>
                <dl className="mt-2 grid grid-cols-3 gap-2 text-xs">
                  <div>
                    <dt className="text-slate-500">利用可能</dt>
                    <dd className="tabular">{qf.format(r.available)}</dd>
                  </div>
                  <div>
                    <dt className="text-slate-500">7日平均</dt>
                    <dd className="tabular">{qf.format(r.average7d)}</dd>
                  </div>
                  <div>
                    <dt className="text-slate-500">欠品予測</dt>
                    <dd className="tabular">{date(r.stockoutDate)}</dd>
                  </div>
                  <div>
                    <dt className="text-slate-500">入荷予定</dt>
                    <dd className="tabular">{qf.format(r.incoming)}</dd>
                  </div>
                  <div>
                    <dt className="text-slate-500">推奨数</dt>
                    <dd className="font-semibold tabular">{qf.format(r.recommendedQuantity)}</dd>
                  </div>
                  <div>
                    <dt className="text-slate-500">発注数</dt>
                    <dd>{quantityInput(r, "w-20")}</dd>
                  </div>
                </dl>
                <p className="mt-2 text-xs text-slate-700">{r.reason}</p>
                <button type="button" onClick={() => setExplaining(r)} className="mt-1 text-xs font-medium text-emerald-800 underline">
                  説明を見る
                </button>
              </div>
            </div>
          </li>
        ))}
      </ul>

      {explaining ? (
        <ExplanationDialog locationId={locationId} row={explaining} onClose={() => setExplaining(null)} />
      ) : null}
    </div>
  );
}

function ExplanationDialog({ locationId, row, onClose }: { locationId: string; row: RecommendationView; onClose: () => void }) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [state, setState] = useState<{ loading: boolean; explanation: Explanation | null; error: string | null }>({
    loading: true,
    explanation: null,
    error: null,
  });
  const titleId = useId();
  const startedRef = useRef(false);

  function attachDialog(node: HTMLDialogElement | null) {
    dialogRef.current = node;
    if (node && !node.open) node.showModal();
    if (node && !startedRef.current) {
      startedRef.current = true;
      explainRecommendationAction(locationId, row.productId)
        .then((result) => {
          if (result.ok && result.data) setState({ loading: false, explanation: result.data, error: null });
          else setState({ loading: false, explanation: null, error: result.message });
        })
        .catch((error: unknown) => {
          console.error("[ai-orders] explanation failed", error);
          setState({ loading: false, explanation: null, error: "説明を取得できませんでした。もう一度お試しください。" });
        });
    }
  }

  return (
    <dialog
      ref={attachDialog}
      aria-labelledby={titleId}
      onClose={onClose}
      className="m-auto w-[calc(100%-2rem)] max-w-xl rounded-lg border border-slate-200 p-0 shadow-xl"
    >
      <div className="p-5">
        <h2 id={titleId} className="flex items-center gap-2 text-base font-semibold text-slate-900">
          <Bot className="size-5 text-emerald-700" aria-hidden="true" />
          推奨理由の説明
        </h2>
        <p className="mt-1 text-xs text-slate-500">
          {row.productName}（{row.sku}）・推奨数 {qf.format(row.recommendedQuantity)} {row.unit}
        </p>
        <div className="mt-4 min-h-24 text-sm text-slate-800" aria-live="polite" aria-busy={state.loading}>
          {state.loading ? (
            <p className="flex items-center gap-2 text-slate-500">
              <Loader2 className="size-4 animate-spin" aria-hidden="true" />
              説明を作成しています…
            </p>
          ) : state.error ? (
            <p role="alert" className="text-red-700">
              {state.error}
            </p>
          ) : state.explanation ? (
            <>
              <p className="leading-relaxed whitespace-pre-line">{state.explanation.text}</p>
              <p className="mt-3 flex flex-wrap items-center gap-2 text-xs text-slate-500">
                <Badge tone={state.explanation.source === "ai" ? "info" : "neutral"}>
                  {state.explanation.source === "ai" ? "AI による説明" : "定型文による説明"}
                </Badge>
                {state.explanation.notice ?? "数量はシステムの計算結果で、AI は変更していません。"}
              </p>
            </>
          ) : null}
        </div>
      </div>
      <div className="flex justify-end border-t border-slate-100 bg-slate-50 px-5 py-3">
        <button type="button" onClick={() => dialogRef.current?.close()} className={buttonClasses("secondary")} autoFocus>
          閉じる
        </button>
      </div>
    </dialog>
  );
}
