"use client";

import { useState } from "react";

import type { ProductOption } from "@/app/(app)/products/actions";
import { ProductPicker } from "@/components/forms/product-picker";
import { useStockInfo } from "@/components/forms/use-stock-info";
import { ActionForm, SelectField, SubmitButton, TextField, TextareaField, inputClass, useFieldError } from "@/components/ui/action-form";
import { ButtonLink } from "@/components/ui/button";
import { WASTE_REASON_LABELS } from "@/lib/labels";

import { createWasteAction } from "./actions";

const qf = new Intl.NumberFormat("ja-JP", { maximumFractionDigits: 3 });

export function WasteForm({
  today,
  locations,
  initial,
}: {
  today: string;
  locations: { value: string; label: string }[];
  initial: { locationId: string; product: ProductOption; lotId: string } | null;
}) {
  const [locationId, setLocationId] = useState(initial?.locationId ?? locations[0]?.value ?? "");
  const [product, setProduct] = useState<ProductOption | null>(initial?.product ?? null);
  const [lotId, setLotId] = useState(initial?.lotId ?? "");
  const stock = useStockInfo();
  const [loadedKey, setLoadedKey] = useState<string | null>(null);
  const productError = useFieldError("product_id");
  const key = product ? `${locationId}:${product.id}` : null;

  if (key !== loadedKey) {
    setLoadedKey(key);
    void stock.load(locationId, product?.id);
  }

  const expiredDefault = stock.info?.lots.some((lot) => lot.expired);

  return (
    <ActionForm action={createWasteAction} refreshOnSuccess={false} className="space-y-4">
      <input type="hidden" name="product_id" value={product?.id ?? ""} />
      <div className="grid grid-cols-1 gap-4 rounded-lg border border-slate-200 bg-white p-4 shadow-sm md:grid-cols-2">
        <label className="block">
          <span className="mb-1 block text-sm font-medium text-slate-700">拠点</span>
          <select
            name="location_id"
            value={locationId}
            onChange={(event) => {
              setLocationId(event.target.value);
              setLotId("");
            }}
            className={inputClass}
          >
            {locations.map((l) => (
              <option key={l.value} value={l.value}>
                {l.label}
              </option>
            ))}
          </select>
        </label>
        <div>
          <ProductPicker
            label="商品"
            value={product}
            error={productError}
            onChange={(next) => {
              setProduct(next);
              setLotId("");
            }}
          />
          {stock.info ? (
            <p className="mt-1 text-xs text-slate-600">
              現在庫 <span className="font-semibold tabular">{qf.format(stock.info.onHand)}</span> {product?.sales_unit}
            </p>
          ) : null}
          {stock.error ? <p className="mt-1 text-xs text-red-700">{stock.error}</p> : null}
        </div>
        <label className="block md:col-span-2">
          <span className="mb-1 block text-sm font-medium text-slate-700">ロット</span>
          <select name="lot_id" value={lotId} onChange={(event) => setLotId(event.target.value)} className={inputClass} disabled={!stock.info}>
            <option value="">自動（期限切れ・賞味期限の早い順）</option>
            {stock.info?.lots.map((lot) => (
              <option key={lot.id} value={lot.id}>
                {lot.lotNumber}｜期限 {lot.expirationDate?.replaceAll("-", "/") ?? "なし"}
                {lot.expired ? "（期限切れ）" : ""}
                {lot.status === "quarantined" ? "（隔離中）" : ""}｜残 {qf.format(lot.quantity)}
              </option>
            ))}
          </select>
        </label>
        <TextField label="廃棄数" name="quantity" type="number" inputMode="decimal" min={0} step="any" required />
        <SelectField
          label="理由"
          name="reason"
          required
          defaultValue={expiredDefault ? "expired" : "damaged"}
          key={expiredDefault ? "expired" : "other"}
          options={Object.entries(WASTE_REASON_LABELS).map(([value, text]) => ({ value, label: text }))}
        />
        <TextField label="廃棄日" name="waste_date" type="date" defaultValue={today} max={today} required />
        <TextareaField label="備考" name="notes" rows={2} maxLength={500} className="md:col-span-2" placeholder="例: 配送時に外箱破損" />
      </div>
      <p className="text-xs text-slate-500">廃棄金額はロットの仕入単価×数量で自動計算され、ダッシュボードの廃棄額・廃棄率とAI発注提案の廃棄傾向に反映されます。</p>
      <div className="flex justify-end gap-2">
        <ButtonLink href="/waste" variant="secondary">
          キャンセル
        </ButtonLink>
        <SubmitButton variant="danger" pendingLabel="登録中…">
          廃棄を登録
        </SubmitButton>
      </div>
    </ActionForm>
  );
}
