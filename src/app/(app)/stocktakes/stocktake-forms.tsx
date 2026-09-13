"use client";

import { useState } from "react";

import { ActionForm, SelectField, SubmitButton, TextareaField } from "@/components/ui/action-form";
import { ButtonLink } from "@/components/ui/button";
import { ConfirmButton } from "@/components/ui/confirm-button";

import { cancelStocktakeAction, completeStocktakeAction, createStocktakeAction, saveStocktakeCountsAction } from "./actions";

export function StocktakeCreateForm({
  locations,
  categories,
}: {
  locations: { value: string; label: string }[];
  categories: { value: string; label: string }[];
}) {
  return (
    <ActionForm action={createStocktakeAction} refreshOnSuccess={false} className="space-y-4 rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <SelectField label="拠点" name="location_id" required defaultValue={locations[0]?.value} options={locations} />
        <SelectField label="対象カテゴリ" name="category_id" placeholder="全カテゴリ" options={categories} hint="部分棚卸の場合に選択" />
        <TextareaField label="備考" name="notes" rows={2} maxLength={2000} className="sm:col-span-2" placeholder="例: 月次定期棚卸" />
      </div>
      <p className="text-xs text-slate-500">開始すると、対象商品の現在庫が理論在庫として記録されます。同じ拠点で進行中の棚卸は1件までです。</p>
      <div className="flex justify-end gap-2">
        <ButtonLink href="/stocktakes" variant="secondary">
          キャンセル
        </ButtonLink>
        <SubmitButton pendingLabel="開始中…">棚卸を開始</SubmitButton>
      </div>
    </ActionForm>
  );
}

export type CountRow = {
  id: string;
  sku: string;
  productName: string;
  unit: string;
  storageNote: string | null;
  expected: number;
  actual: number | null;
  reason: string | null;
};

const qf = new Intl.NumberFormat("ja-JP", { maximumFractionDigits: 3 });

export function StocktakeCountForm({ stocktakeId, rows, canCount }: { stocktakeId: string; rows: CountRow[]; canCount: boolean }) {
  const [values, setValues] = useState<Record<string, { actual: string; reason: string }>>(() =>
    Object.fromEntries(rows.map((r) => [r.id, { actual: r.actual === null ? "" : String(r.actual), reason: r.reason ?? "" }])),
  );
  const payload = JSON.stringify(rows.map((r) => ({ item_id: r.id, actual_quantity: values[r.id]?.actual ?? "", reason: values[r.id]?.reason ?? "" })));

  return (
    <ActionForm action={saveStocktakeCountsAction.bind(null, stocktakeId)}>
      <input type="hidden" name="items" value={payload} />
      <div className="overflow-x-auto">
        <table className="min-w-full text-sm">
          <caption className="sr-only">棚卸カウント入力</caption>
          <thead className="bg-slate-50 text-xs text-slate-600">
            <tr>
              <th scope="col" className="px-3 py-2 text-left font-semibold">商品</th>
              <th scope="col" className="px-3 py-2 text-left font-semibold">保管場所</th>
              <th scope="col" className="px-3 py-2 text-right font-semibold">理論在庫</th>
              <th scope="col" className="px-3 py-2 text-right font-semibold">実数</th>
              <th scope="col" className="px-3 py-2 text-right font-semibold">差異</th>
              <th scope="col" className="px-3 py-2 text-left font-semibold">差異理由</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const value = values[r.id] ?? { actual: "", reason: "" };
              const actual = value.actual === "" ? null : Number(value.actual);
              const diff = actual === null || !Number.isFinite(actual) ? null : actual - r.expected;
              return (
                <tr key={r.id} className="border-t border-slate-100 align-top">
                  <td className="min-w-56 px-3 py-2">
                    <p className="text-slate-900">{r.productName}</p>
                    <p className="font-mono text-xs text-slate-500">{r.sku}</p>
                  </td>
                  <td className="px-3 py-2 text-xs text-slate-600">{r.storageNote ?? "—"}</td>
                  <td className="px-3 py-2 text-right whitespace-nowrap tabular">
                    {qf.format(r.expected)} {r.unit}
                  </td>
                  <td className="px-3 py-2 text-right">
                    <input
                      type="number"
                      inputMode="decimal"
                      min={0}
                      step="any"
                      value={value.actual}
                      disabled={!canCount}
                      onChange={(event) => setValues((current) => ({ ...current, [r.id]: { ...value, actual: event.target.value } }))}
                      aria-label={`${r.productName}の実数`}
                      className="w-24 rounded-md border border-slate-300 px-2 py-1 text-right tabular disabled:bg-slate-100"
                    />
                  </td>
                  <td className={`px-3 py-2 text-right whitespace-nowrap tabular ${diff !== null && diff !== 0 ? "font-semibold text-red-700" : "text-slate-500"}`}>
                    {diff === null ? "未カウント" : diff === 0 ? "差異なし" : `${diff > 0 ? "+" : ""}${qf.format(diff)}`}
                  </td>
                  <td className="px-3 py-2">
                    <input
                      type="text"
                      maxLength={500}
                      value={value.reason}
                      disabled={!canCount || diff === null || diff === 0}
                      onChange={(event) => setValues((current) => ({ ...current, [r.id]: { ...value, reason: event.target.value } }))}
                      aria-label={`${r.productName}の差異理由`}
                      placeholder={diff !== null && diff !== 0 ? "例: 破損品を発見" : ""}
                      className="w-48 rounded-md border border-slate-300 px-2 py-1 text-sm disabled:bg-slate-100"
                    />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {canCount ? (
        <div className="flex justify-end border-t border-slate-100 px-4 py-3">
          <SubmitButton variant="secondary" pendingLabel="保存中…">
            このページのカウントを保存
          </SubmitButton>
        </div>
      ) : null}
    </ActionForm>
  );
}

export function StocktakeStatusActions({
  stocktakeId,
  countedCount,
  totalCount,
  differenceCount,
}: {
  stocktakeId: string;
  countedCount: number;
  totalCount: number;
  differenceCount: number;
}) {
  return (
    <>
      <ConfirmButton
        action={() => cancelStocktakeAction(stocktakeId)}
        title="棚卸を中止しますか？"
        description="入力したカウントは保存されたまま、在庫には反映されません。"
        confirmLabel="中止する"
        confirmVariant="danger"
        variant="secondary"
      >
        中止
      </ConfirmButton>
      <ConfirmButton
        action={() => completeStocktakeAction(stocktakeId)}
        title="棚卸を確定しますか？"
        description={
          <>
            <p>
              カウント済み {countedCount.toLocaleString("ja-JP")} / {totalCount.toLocaleString("ja-JP")} 品目、差異あり {differenceCount.toLocaleString("ja-JP")} 品目。
            </p>
            <p className="mt-2">確定すると、カウント済み品目の実数と確定時点の在庫との差を「棚卸差異」として在庫・ロット・入出庫履歴に反映します。未カウントの品目は変更しません。この操作は取り消せません。</p>
          </>
        }
        confirmLabel="確定して在庫に反映"
        disabled={countedCount === 0}
      >
        棚卸を確定
      </ConfirmButton>
    </>
  );
}
