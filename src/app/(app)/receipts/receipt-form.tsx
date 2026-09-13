"use client";

import { Plus, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { ActionForm, SelectField, SubmitButton, TextField, TextareaField, inputClass, useFieldError } from "@/components/ui/action-form";
import { Button, ButtonLink } from "@/components/ui/button";
import { ProductPicker } from "@/components/forms/product-picker";
import type { ProductOption } from "@/app/(app)/products/actions";

import { createReceiptAction } from "./actions";

type Line = {
  key: number;
  product: ProductOption | null;
  quantity: string;
  lot_number: string;
  manufacture_date: string;
  expiration_date: string;
  unit_cost: string;
  remaining?: number;
};

export type PurchaseOrderPrefill = {
  id: string;
  orderNumber: string;
  locationId: string;
  supplierId: string;
  lines: { product: ProductOption; remaining: number; unitCost: number }[];
};

function addDays(date: string, days: number): string {
  return new Date(Date.parse(`${date}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);
}

let nextKey = 1;

function LineEditor({
  line,
  index,
  onChange,
  onRemove,
  locked,
  canRemove,
}: {
  line: Line;
  index: number;
  onChange: (line: Line) => void;
  onRemove: () => void;
  locked: boolean;
  canRemove: boolean;
}) {
  const productError = useFieldError(`items.${index}.product_id`);
  const quantityError = useFieldError(`items.${index}.quantity`);
  const mfgError = useFieldError(`items.${index}.manufacture_date`);
  const expError = useFieldError(`items.${index}.expiration_date`);
  const costError = useFieldError(`items.${index}.unit_cost`);
  const field = (name: keyof Line, value: string) => onChange({ ...line, [name]: value });

  return (
    <li className="rounded-md border border-slate-200 p-3">
      <div className="mb-2 flex items-center justify-between">
        <p className="text-xs font-semibold text-slate-600">明細 {index + 1}</p>
        {canRemove ? (
          <Button variant="ghost" size="sm" onClick={onRemove} aria-label={`明細${index + 1}を削除`}>
            <Trash2 className="size-4" aria-hidden="true" />
            削除
          </Button>
        ) : null}
      </div>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-6">
        <div className="md:col-span-2">
          <ProductPicker
            label="商品"
            value={line.product}
            disabled={locked}
            error={productError}
            onChange={(product) =>
              onChange({
                ...line,
                product,
                unit_cost: product ? String(product.cost_price) : "",
                expiration_date:
                  product?.shelf_life_days && line.manufacture_date ? addDays(line.manufacture_date, product.shelf_life_days) : line.expiration_date,
              })
            }
          />
          {line.remaining !== undefined ? <p className="mt-1 text-xs text-slate-500">発注残 {line.remaining}</p> : null}
        </div>
        <label className="block">
          <span className="mb-1 block text-sm font-medium text-slate-700">入庫数</span>
          <input type="number" inputMode="decimal" min={0} step="any" value={line.quantity} onChange={(e) => field("quantity", e.target.value)} aria-invalid={Boolean(quantityError)} className={inputClass} />
          {quantityError ? <span className="mt-1 block text-xs text-red-700">{quantityError}</span> : null}
        </label>
        <label className="block">
          <span className="mb-1 block text-sm font-medium text-slate-700">ロット番号</span>
          <input type="text" maxLength={60} value={line.lot_number} onChange={(e) => field("lot_number", e.target.value)} placeholder="空欄で自動採番" className={inputClass} />
        </label>
        <label className="block">
          <span className="mb-1 block text-sm font-medium text-slate-700">製造日</span>
          <input
            type="date"
            value={line.manufacture_date}
            onChange={(e) => {
              const mfg = e.target.value;
              const shelf = line.product?.shelf_life_days;
              onChange({ ...line, manufacture_date: mfg, expiration_date: mfg && shelf && !line.expiration_date ? addDays(mfg, shelf) : line.expiration_date });
            }}
            aria-invalid={Boolean(mfgError)}
            className={inputClass}
          />
          {mfgError ? <span className="mt-1 block text-xs text-red-700">{mfgError}</span> : null}
        </label>
        <label className="block">
          <span className="mb-1 block text-sm font-medium text-slate-700">賞味期限</span>
          <input type="date" value={line.expiration_date} onChange={(e) => field("expiration_date", e.target.value)} aria-invalid={Boolean(expError)} className={inputClass} />
          {expError ? <span className="mt-1 block text-xs text-red-700">{expError}</span> : null}
        </label>
        <label className="block md:col-start-6">
          <span className="mb-1 block text-sm font-medium text-slate-700">単価（円）</span>
          <input type="number" inputMode="decimal" min={0} step="0.01" value={line.unit_cost} onChange={(e) => field("unit_cost", e.target.value)} aria-invalid={Boolean(costError)} className={inputClass} />
          {costError ? <span className="mt-1 block text-xs text-red-700">{costError}</span> : null}
        </label>
      </div>
    </li>
  );
}

export function ReceiptForm({
  today,
  locations,
  suppliers,
  openOrders,
  prefill,
}: {
  today: string;
  locations: { value: string; label: string }[];
  suppliers: { value: string; label: string }[];
  openOrders: { value: string; label: string }[];
  prefill: PurchaseOrderPrefill | null;
}) {
  const router = useRouter();
  const [lines, setLines] = useState<Line[]>(() =>
    prefill
      ? prefill.lines.map((l) => ({
          key: nextKey++,
          product: l.product,
          quantity: String(l.remaining),
          lot_number: "",
          manufacture_date: "",
          expiration_date: l.product.shelf_life_days ? addDays(today, l.product.shelf_life_days) : "",
          unit_cost: String(l.unitCost),
          remaining: l.remaining,
        }))
      : [{ key: nextKey++, product: null, quantity: "", lot_number: "", manufacture_date: "", expiration_date: "", unit_cost: "" }],
  );

  const payload = JSON.stringify(
    lines.map((l) => ({
      product_id: l.product?.id ?? "",
      quantity: l.quantity,
      lot_number: l.lot_number,
      manufacture_date: l.manufacture_date,
      expiration_date: l.expiration_date,
      unit_cost: l.unit_cost,
    })),
  );

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
        <label htmlFor="po-select" className="mb-1 block text-sm font-medium text-slate-700">
          発注書から入庫する（任意）
        </label>
        <select
          id="po-select"
          className={inputClass}
          value={prefill?.id ?? ""}
          onChange={(event) => router.push(event.target.value ? `/receipts/new?po=${event.target.value}` : "/receipts/new")}
        >
          <option value="">発注書を使わずに入庫する</option>
          {openOrders.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
        <p className="mt-1 text-xs text-slate-500">発注書を選ぶと、発注残の明細が入力され、入荷数が発注書に反映されます。</p>
      </div>

      <ActionForm action={createReceiptAction} refreshOnSuccess={false} className="space-y-4">
        <input type="hidden" name="items" value={payload} />
        {prefill ? <input type="hidden" name="purchase_order_id" value={prefill.id} /> : null}
        <div className="grid grid-cols-1 gap-4 rounded-lg border border-slate-200 bg-white p-4 shadow-sm sm:grid-cols-3">
          <SelectField
            label="入庫先"
            name="location_id"
            required
            defaultValue={prefill?.locationId ?? locations[0]?.value}
            options={locations}
            disabled={Boolean(prefill)}
          />
          {prefill ? <input type="hidden" name="location_id" value={prefill.locationId} /> : null}
          <SelectField label="仕入先" name="supplier_id" defaultValue={prefill?.supplierId ?? ""} placeholder="指定なし" options={suppliers} disabled={Boolean(prefill)} />
          {prefill ? <input type="hidden" name="supplier_id" value={prefill.supplierId} /> : null}
          <TextField label="入庫日" name="received_date" type="date" defaultValue={today} max={today} required />
          <TextareaField label="備考" name="notes" className="sm:col-span-3" rows={2} maxLength={2000} placeholder={prefill ? `発注書 ${prefill.orderNumber} の入荷` : "検品メモなど"} />
        </div>

        <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
          <h2 className="mb-3 text-sm font-semibold text-slate-900">入庫明細</h2>
          <ul className="space-y-3">
            {lines.map((line, index) => (
              <LineEditor
                key={line.key}
                line={line}
                index={index}
                locked={Boolean(prefill)}
                canRemove={lines.length > 1}
                onChange={(next) => setLines((current) => current.map((l) => (l.key === line.key ? next : l)))}
                onRemove={() => setLines((current) => current.filter((l) => l.key !== line.key))}
              />
            ))}
          </ul>
          {!prefill ? (
            <Button
              variant="secondary"
              size="sm"
              className="mt-3"
              onClick={() => setLines((current) => [...current, { key: nextKey++, product: null, quantity: "", lot_number: "", manufacture_date: "", expiration_date: "", unit_cost: "" }])}
            >
              <Plus className="size-4" aria-hidden="true" />
              明細を追加
            </Button>
          ) : null}
        </div>

        <div className="flex justify-end gap-2">
          <ButtonLink href="/receipts" variant="secondary">
            キャンセル
          </ButtonLink>
          <SubmitButton pendingLabel="登録中…">入庫を登録</SubmitButton>
        </div>
      </ActionForm>
    </div>
  );
}
