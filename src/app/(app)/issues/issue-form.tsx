"use client";

import { Plus, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";

import type { ProductOption } from "@/app/(app)/products/actions";
import { ProductPicker } from "@/components/forms/product-picker";
import { useStockInfo } from "@/components/forms/use-stock-info";
import { ActionForm, SubmitButton, TextareaField, inputClass, useFieldError } from "@/components/ui/action-form";
import { Button, ButtonLink } from "@/components/ui/button";

import { createIssueAction } from "./actions";

type Line = { key: number; product: ProductOption | null; quantity: string; lotId: string };

let nextKey = 1;
const qf = new Intl.NumberFormat("ja-JP", { maximumFractionDigits: 3 });

function IssueLine({
  line,
  index,
  locationId,
  onChange,
  onRemove,
  canRemove,
}: {
  line: Line;
  index: number;
  locationId: string;
  onChange: (line: Line) => void;
  onRemove: () => void;
  canRemove: boolean;
}) {
  const stock = useStockInfo();
  const loadStock = stock.load;
  const productError = useFieldError(`items.${index}.product_id`);
  const quantityError = useFieldError(`items.${index}.quantity`);

  const productId = line.product?.id;
  useEffect(() => {
    void loadStock(locationId, productId);
  }, [locationId, productId, loadStock]);

  const usableLots = stock.info?.lots.filter((lot) => !lot.expired && lot.status === "available") ?? [];
  const quantity = Number(line.quantity);
  const over = stock.info !== null && Number.isFinite(quantity) && quantity > stock.info.available;

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
      <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
        <div className="md:col-span-2">
          <ProductPicker
            label="商品"
            value={line.product}
            error={productError}
            onChange={(product) => {
              onChange({ ...line, product, lotId: "" });
              void stock.load(locationId, product?.id);
            }}
          />
          {stock.loading ? <p className="mt-1 text-xs text-slate-500">在庫を確認しています…</p> : null}
          {stock.error ? <p className="mt-1 text-xs text-red-700">{stock.error}</p> : null}
          {stock.info ? (
            <p className="mt-1 text-xs text-slate-600">
              利用可能在庫 <span className="font-semibold tabular">{qf.format(stock.info.available)}</span> {line.product?.sales_unit}
              （現在庫 {qf.format(stock.info.onHand)}）
            </p>
          ) : null}
        </div>
        <label className="block">
          <span className="mb-1 block text-sm font-medium text-slate-700">出庫数</span>
          <input
            type="number"
            inputMode="decimal"
            min={0}
            step="any"
            value={line.quantity}
            onChange={(event) => onChange({ ...line, quantity: event.target.value })}
            aria-invalid={Boolean(quantityError) || over}
            className={inputClass}
          />
          {quantityError ? <span className="mt-1 block text-xs text-red-700">{quantityError}</span> : null}
          {!quantityError && over ? <span className="mt-1 block text-xs text-red-700">利用可能在庫を超えています</span> : null}
        </label>
        <label className="block">
          <span className="mb-1 block text-sm font-medium text-slate-700">ロット</span>
          <select value={line.lotId} onChange={(event) => onChange({ ...line, lotId: event.target.value })} className={inputClass} disabled={!stock.info}>
            <option value="">自動（FEFO：期限の早い順）</option>
            {usableLots.map((lot) => (
              <option key={lot.id} value={lot.id}>
                {lot.lotNumber}｜期限 {lot.expirationDate?.replaceAll("-", "/") ?? "なし"}｜残 {qf.format(lot.quantity)}
              </option>
            ))}
          </select>
        </label>
      </div>
    </li>
  );
}

export function IssueForm({ locations }: { locations: { value: string; label: string }[] }) {
  const [locationId, setLocationId] = useState(locations[0]?.value ?? "");
  const [issueType, setIssueType] = useState<"sale" | "usage" | "transfer">("sale");
  const [lines, setLines] = useState<Line[]>([{ key: nextKey++, product: null, quantity: "", lotId: "" }]);
  const locationError = useFieldError("location_id");
  const destinationError = useFieldError("destination_location_id");

  const payload = JSON.stringify(lines.map((l) => ({ product_id: l.product?.id ?? "", quantity: l.quantity, lot_id: l.lotId })));

  return (
    <ActionForm action={createIssueAction} refreshOnSuccess={false} className="space-y-4">
      <input type="hidden" name="items" value={payload} />
      <div className="grid grid-cols-1 gap-4 rounded-lg border border-slate-200 bg-white p-4 shadow-sm md:grid-cols-3">
        <fieldset>
          <legend className="mb-1 text-sm font-medium text-slate-700">出庫区分</legend>
          <div className="flex flex-wrap gap-3">
            {(
              [
                ["sale", "販売"],
                ["usage", "使用・加工"],
                ["transfer", "拠点間移動"],
              ] as const
            ).map(([value, text]) => (
              <label key={value} className="flex items-center gap-1.5 text-sm">
                <input type="radio" name="issue_type" value={value} checked={issueType === value} onChange={() => setIssueType(value)} className="size-4" />
                {text}
              </label>
            ))}
          </div>
        </fieldset>
        <label className="block">
          <span className="mb-1 block text-sm font-medium text-slate-700">出庫元の拠点</span>
          <select name="location_id" value={locationId} onChange={(event) => setLocationId(event.target.value)} className={inputClass} aria-invalid={Boolean(locationError)}>
            {locations.map((l) => (
              <option key={l.value} value={l.value}>
                {l.label}
              </option>
            ))}
          </select>
          {locationError ? <span className="mt-1 block text-xs text-red-700">{locationError}</span> : null}
        </label>
        {issueType === "transfer" ? (
          <label className="block">
            <span className="mb-1 block text-sm font-medium text-slate-700">移動先の拠点</span>
            <select name="destination_location_id" defaultValue="" className={inputClass} aria-invalid={Boolean(destinationError)}>
              <option value="">選択してください</option>
              {locations
                .filter((l) => l.value !== locationId)
                .map((l) => (
                  <option key={l.value} value={l.value}>
                    {l.label}
                  </option>
                ))}
            </select>
            {destinationError ? <span className="mt-1 block text-xs text-red-700">{destinationError}</span> : null}
          </label>
        ) : null}
        <TextareaField label="備考" name="notes" rows={2} maxLength={2000} className="md:col-span-3" />
      </div>

      <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
        <h2 className="text-sm font-semibold text-slate-900">出庫明細</h2>
        <p className="mb-3 text-xs text-slate-500">ロットを指定しない場合、期限切れ・隔離中を除き賞味期限の早いロットから自動で引き当てます（複数ロットにまたがる場合があります）。在庫が不足する場合は登録できません。</p>
        <ul className="space-y-3">
          {lines.map((line, index) => (
            <IssueLine
              key={line.key}
              line={line}
              index={index}
              locationId={locationId}
              canRemove={lines.length > 1}
              onChange={(next) => setLines((current) => current.map((l) => (l.key === line.key ? next : l)))}
              onRemove={() => setLines((current) => current.filter((l) => l.key !== line.key))}
            />
          ))}
        </ul>
        <Button variant="secondary" size="sm" className="mt-3" onClick={() => setLines((current) => [...current, { key: nextKey++, product: null, quantity: "", lotId: "" }])}>
          <Plus className="size-4" aria-hidden="true" />
          明細を追加
        </Button>
      </div>

      <div className="flex justify-end gap-2">
        <ButtonLink href="/issues" variant="secondary">
          キャンセル
        </ButtonLink>
        <SubmitButton pendingLabel="登録中…">{issueType === "transfer" ? "移動を登録" : "出庫を登録"}</SubmitButton>
      </div>
    </ActionForm>
  );
}
