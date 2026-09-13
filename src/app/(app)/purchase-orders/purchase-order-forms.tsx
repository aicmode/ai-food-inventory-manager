"use client";

import { Plus, Trash2 } from "lucide-react";
import { useState } from "react";

import type { ProductOption } from "@/app/(app)/products/actions";
import { ProductPicker } from "@/components/forms/product-picker";
import { ActionForm, SubmitButton, TextField, TextareaField, inputClass, useFieldError } from "@/components/ui/action-form";
import { Button, ButtonLink } from "@/components/ui/button";
import { ConfirmButton } from "@/components/ui/confirm-button";
import { calculatePurchaseOrderTotals } from "@/lib/domain/inventory";
import { isValidOrderQuantity } from "@/lib/domain/recommendation";

import { createPurchaseOrderAction, setPurchaseOrderStatusAction, updatePurchaseOrderDraftAction } from "./actions";

const yen = new Intl.NumberFormat("ja-JP", { style: "currency", currency: "JPY", maximumFractionDigits: 0 });
const qf = new Intl.NumberFormat("ja-JP", { maximumFractionDigits: 3 });

type Line = { key: number; product: ProductOption | null; quantity: string; unitCost: string };
let nextKey = 1;

function OrderLine({
  line,
  index,
  supplierId,
  onChange,
  onRemove,
  canRemove,
}: {
  line: Line;
  index: number;
  supplierId: string;
  onChange: (line: Line) => void;
  onRemove: () => void;
  canRemove: boolean;
}) {
  const productError = useFieldError(`items.${index}.product_id`);
  const quantityError = useFieldError(`items.${index}.ordered_quantity`);
  const quantity = Number(line.quantity);
  const lotInvalid =
    line.product !== null &&
    line.quantity !== "" &&
    !isValidOrderQuantity(quantity, { minimumOrderQuantity: line.product.minimum_order_quantity, orderLotSize: line.product.order_lot_size });

  return (
    <li className="grid grid-cols-1 gap-3 rounded-md border border-slate-200 p-3 md:grid-cols-[1fr_8rem_8rem_7rem_auto] md:items-start">
      <div>
        <ProductPicker
          label={`明細 ${index + 1}：商品`}
          value={line.product}
          supplierId={supplierId || undefined}
          error={productError}
          onChange={(product) => onChange({ ...line, product, unitCost: product ? String(product.cost_price) : "", quantity: product ? String(product.order_lot_size) : "" })}
        />
        {line.product ? (
          <p className="mt-1 text-xs text-slate-500">
            発注単位 {qf.format(line.product.order_lot_size)}・最小 {qf.format(line.product.minimum_order_quantity)} {line.product.sales_unit}
          </p>
        ) : null}
      </div>
      <label className="block">
        <span className="mb-1 block text-sm font-medium text-slate-700">発注数</span>
        <input
          type="number"
          inputMode="decimal"
          min={0}
          step={line.product?.order_lot_size ?? "any"}
          value={line.quantity}
          onChange={(event) => onChange({ ...line, quantity: event.target.value })}
          aria-invalid={Boolean(quantityError) || lotInvalid}
          className={inputClass}
        />
        {quantityError ? <span className="mt-1 block text-xs text-red-700">{quantityError}</span> : null}
        {!quantityError && lotInvalid ? <span className="mt-1 block text-xs text-red-700">発注単位の倍数・最小発注数量以上にしてください</span> : null}
      </label>
      <label className="block">
        <span className="mb-1 block text-sm font-medium text-slate-700">単価（円）</span>
        <input type="number" inputMode="decimal" min={0} step="0.01" value={line.unitCost} onChange={(event) => onChange({ ...line, unitCost: event.target.value })} className={inputClass} />
      </label>
      <div className="text-sm md:pt-7">
        <span className="text-xs text-slate-500 md:hidden">小計 </span>
        <span className="tabular">{yen.format((Number(line.quantity) || 0) * (Number(line.unitCost) || 0))}</span>
      </div>
      {canRemove ? (
        <Button variant="ghost" size="sm" onClick={onRemove} aria-label={`明細${index + 1}を削除`} className="md:mt-6">
          <Trash2 className="size-4" aria-hidden="true" />
        </Button>
      ) : null}
    </li>
  );
}

export function PurchaseOrderCreateForm({
  suppliers,
  locations,
  today,
  initialSupplierId,
}: {
  suppliers: { value: string; label: string; leadTime: number }[];
  locations: { value: string; label: string }[];
  today: string;
  initialSupplierId?: string;
}) {
  const [supplierId, setSupplierId] = useState(initialSupplierId ?? "");
  const [lines, setLines] = useState<Line[]>([{ key: nextKey++, product: null, quantity: "", unitCost: "" }]);
  const supplierError = useFieldError("supplier_id");
  const totals = calculatePurchaseOrderTotals(
    lines.filter((l) => l.product).map((l) => ({ quantity: Number(l.quantity) || 0, unitCost: Number(l.unitCost) || 0, taxRate: 8 })),
  );
  const payload = JSON.stringify(lines.map((l) => ({ product_id: l.product?.id ?? "", ordered_quantity: l.quantity, unit_cost: l.unitCost })));

  return (
    <ActionForm action={createPurchaseOrderAction} refreshOnSuccess={false} className="space-y-4">
      <input type="hidden" name="items" value={payload} />
      <div className="grid grid-cols-1 gap-4 rounded-lg border border-slate-200 bg-white p-4 shadow-sm md:grid-cols-3">
        <label className="block">
          <span className="mb-1 block text-sm font-medium text-slate-700">仕入先</span>
          <select
            name="supplier_id"
            value={supplierId}
            onChange={(event) => {
              setSupplierId(event.target.value);
              setLines([{ key: nextKey++, product: null, quantity: "", unitCost: "" }]);
            }}
            className={inputClass}
            aria-invalid={Boolean(supplierError)}
          >
            <option value="">選択してください</option>
            {suppliers.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>
          {supplierError ? <span className="mt-1 block text-xs text-red-700">{supplierError}</span> : null}
          <span className="mt-1 block text-xs text-slate-500">主要仕入先が一致する商品を検索できます。</span>
        </label>
        <label className="block">
          <span className="mb-1 block text-sm font-medium text-slate-700">納品先</span>
          <select name="location_id" defaultValue={locations[0]?.value} className={inputClass}>
            {locations.map((l) => (
              <option key={l.value} value={l.value}>
                {l.label}
              </option>
            ))}
          </select>
        </label>
        <TextField label="納品予定日" name="expected_delivery_date" type="date" min={today} hint="空欄の場合はリードタイムから自動設定" />
        <TextareaField label="備考" name="notes" rows={2} maxLength={2000} className="md:col-span-3" />
      </div>

      <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
        <h2 className="mb-3 text-sm font-semibold text-slate-900">発注明細</h2>
        {supplierId ? (
          <>
            <ul className="space-y-3">
              {lines.map((line, index) => (
                <OrderLine
                  key={line.key}
                  line={line}
                  index={index}
                  supplierId={supplierId}
                  canRemove={lines.length > 1}
                  onChange={(next) => setLines((current) => current.map((l) => (l.key === line.key ? next : l)))}
                  onRemove={() => setLines((current) => current.filter((l) => l.key !== line.key))}
                />
              ))}
            </ul>
            <Button variant="secondary" size="sm" className="mt-3" onClick={() => setLines((current) => [...current, { key: nextKey++, product: null, quantity: "", unitCost: "" }])}>
              <Plus className="size-4" aria-hidden="true" />
              明細を追加
            </Button>
          </>
        ) : (
          <p className="text-sm text-slate-500">先に仕入先を選択してください。</p>
        )}
        <dl className="mt-4 ml-auto grid max-w-xs grid-cols-2 gap-1 text-sm">
          <dt className="text-slate-600">小計（税抜）</dt>
          <dd className="text-right tabular">{yen.format(totals.subtotal)}</dd>
          <dt className="text-slate-600">消費税（8%・切捨て）</dt>
          <dd className="text-right tabular">{yen.format(totals.taxAmount)}</dd>
          <dt className="font-semibold">合計（概算）</dt>
          <dd className="text-right font-semibold tabular">{yen.format(totals.totalAmount)}</dd>
        </dl>
        <p className="mt-1 text-right text-xs text-slate-500">確定金額は保存時に商品ごとの税率で計算されます。</p>
      </div>

      <div className="flex flex-wrap justify-end gap-2">
        <ButtonLink href="/purchase-orders" variant="secondary">
          キャンセル
        </ButtonLink>
        <SubmitButton variant="secondary" name="intent" value="draft" pendingLabel="保存中…">
          下書き保存
        </SubmitButton>
        <SubmitButton name="intent" value="order" pendingLabel="確定中…">
          発注を確定
        </SubmitButton>
      </div>
    </ActionForm>
  );
}

export type DraftItem = {
  id: string;
  productName: string;
  sku: string;
  unit: string;
  quantity: number;
  unitCost: number;
  taxRate: number;
  orderLotSize: number;
  minimumOrderQuantity: number;
};

export function PurchaseOrderDraftForm({
  orderId,
  items,
  expectedDeliveryDate,
  notes,
  orderDate,
}: {
  orderId: string;
  items: DraftItem[];
  expectedDeliveryDate: string | null;
  notes: string | null;
  orderDate: string;
}) {
  const [quantities, setQuantities] = useState<Record<string, string>>(() => Object.fromEntries(items.map((i) => [i.id, String(i.quantity)])));
  const totals = calculatePurchaseOrderTotals(items.map((i) => ({ quantity: Number(quantities[i.id]) || 0, unitCost: i.unitCost, taxRate: i.taxRate })));
  const payload = JSON.stringify(items.map((i) => ({ item_id: i.id, ordered_quantity: quantities[i.id] ?? "0" })));

  return (
    <ActionForm action={updatePurchaseOrderDraftAction.bind(null, orderId)} className="space-y-4">
      <input type="hidden" name="items" value={payload} />
      <div className="overflow-x-auto">
        <table className="min-w-full text-sm">
          <caption className="sr-only">発注明細（編集）</caption>
          <thead className="bg-slate-50 text-xs text-slate-600">
            <tr>
              <th scope="col" className="px-3 py-2 text-left font-semibold">商品</th>
              <th scope="col" className="px-3 py-2 text-right font-semibold">発注数</th>
              <th scope="col" className="px-3 py-2 text-right font-semibold">単価</th>
              <th scope="col" className="px-3 py-2 text-right font-semibold">小計</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => {
              const value = quantities[item.id] ?? "";
              const quantity = Number(value);
              const invalid = value !== "" && quantity !== 0 && !isValidOrderQuantity(quantity, { minimumOrderQuantity: item.minimumOrderQuantity, orderLotSize: item.orderLotSize });
              return (
                <tr key={item.id} className="border-t border-slate-100 align-top">
                  <td className="min-w-56 px-3 py-2">
                    {item.productName}
                    <p className="font-mono text-xs text-slate-500">
                      {item.sku}・発注単位 {qf.format(item.orderLotSize)}
                    </p>
                  </td>
                  <td className="px-3 py-2 text-right">
                    <input
                      type="number"
                      min={0}
                      step={item.orderLotSize}
                      value={value}
                      onChange={(event) => setQuantities((current) => ({ ...current, [item.id]: event.target.value }))}
                      aria-label={`${item.productName}の発注数`}
                      aria-invalid={invalid}
                      className={`w-24 rounded-md border px-2 py-1 text-right tabular ${invalid ? "border-red-500 bg-red-50" : "border-slate-300"}`}
                    />
                    <p className="mt-0.5 text-xs text-slate-500">0で明細削除</p>
                  </td>
                  <td className="px-3 py-2 text-right whitespace-nowrap tabular">{yen.format(item.unitCost)}</td>
                  <td className="px-3 py-2 text-right whitespace-nowrap tabular">{yen.format((Number(value) || 0) * item.unitCost)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="grid grid-cols-1 gap-4 px-4 sm:grid-cols-2">
        <TextField label="納品予定日" name="expected_delivery_date" type="date" min={orderDate} defaultValue={expectedDeliveryDate ?? ""} />
        <TextareaField label="備考" name="notes" rows={2} defaultValue={notes ?? ""} maxLength={2000} />
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 px-4 py-3">
        <p className="text-sm text-slate-700">
          合計（税込概算）<span className="ml-2 font-semibold tabular">{yen.format(totals.totalAmount)}</span>
        </p>
        <SubmitButton variant="secondary" pendingLabel="保存中…">
          下書きを保存
        </SubmitButton>
      </div>
    </ActionForm>
  );
}

export function PurchaseOrderStatusActions({ orderId, status, hasReceived }: { orderId: string; status: string; hasReceived: boolean }) {
  return (
    <>
      {(status === "draft" || status === "ordered") && !hasReceived ? (
        <ConfirmButton
          action={() => setPurchaseOrderStatusAction(orderId, "cancelled")}
          title="発注書をキャンセルしますか？"
          description="キャンセルした発注書は入荷予定から除外され、元に戻せません。"
          confirmLabel="キャンセルする"
          confirmVariant="danger"
          variant="secondary"
        >
          キャンセル
        </ConfirmButton>
      ) : null}
      {status === "draft" ? (
        <ConfirmButton
          action={() => setPurchaseOrderStatusAction(orderId, "ordered")}
          title="発注を確定しますか？"
          description="確定すると明細は編集できなくなり、AI発注提案の入荷予定に反映されます。仕入先への連絡は別途行ってください。"
          confirmLabel="発注を確定"
        >
          発注を確定
        </ConfirmButton>
      ) : null}
    </>
  );
}
