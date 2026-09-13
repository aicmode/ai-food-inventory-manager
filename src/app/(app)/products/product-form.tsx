"use client";

import { useState } from "react";

import { ActionForm, CheckboxField, SelectField, SubmitButton, TextField, TextareaField, type FormAction } from "@/components/ui/action-form";
import { ButtonLink } from "@/components/ui/button";

export type ProductFormDefaults = {
  sku?: string;
  jan_code?: string | null;
  product_name?: string;
  product_name_kana?: string | null;
  manufacturer?: string | null;
  brand?: string | null;
  category_id?: string | null;
  subcategory_id?: string | null;
  specification?: string | null;
  content_amount?: number | null;
  content_unit?: string | null;
  sales_unit?: string;
  purchase_unit?: string;
  units_per_case?: number;
  cost_price?: number;
  selling_price?: number;
  tax_rate?: number;
  storage_type?: string;
  storage_temperature_min?: number | null;
  storage_temperature_max?: number | null;
  shelf_life_days?: number | null;
  expiration_warning_days?: number;
  safety_stock?: number;
  reorder_point?: number;
  standard_order_quantity?: number;
  minimum_order_quantity?: number;
  order_lot_size?: number;
  lead_time_days?: number;
  primary_supplier_id?: string | null;
  storage_location_note?: string | null;
  notes?: string | null;
  is_active?: boolean;
};

const v = (value: string | number | null | undefined) => (value === null || value === undefined ? "" : String(value));

function Section({ title, description, children }: { title: string; description?: string; children: React.ReactNode }) {
  return (
    <fieldset className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
      <legend className="px-1 text-sm font-semibold text-slate-900">{title}</legend>
      {description ? <p className="mb-3 text-xs text-slate-500">{description}</p> : null}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">{children}</div>
    </fieldset>
  );
}

export function ProductForm({
  action,
  defaults = {},
  categories,
  suppliers,
  submitLabel,
  cancelHref,
}: {
  action: FormAction;
  defaults?: ProductFormDefaults;
  categories: { id: string; name: string; parent_id: string | null }[];
  suppliers: { id: string; label: string }[];
  submitLabel: string;
  cancelHref: string;
}) {
  const [categoryId, setCategoryId] = useState(defaults.category_id ?? "");
  const tops = categories.filter((c) => c.parent_id === null);
  const subs = categories.filter((c) => c.parent_id === categoryId);

  return (
    <ActionForm action={action} refreshOnSuccess={false} className="space-y-5">
      <Section title="基本情報">
        <TextField label="SKU" name="sku" defaultValue={v(defaults.sku)} required maxLength={40} hint="英数字・ハイフン" />
        <TextField label="JANコード" name="jan_code" defaultValue={v(defaults.jan_code)} inputMode="numeric" maxLength={13} hint="8桁または13桁（任意）" />
        <TextField label="商品名" name="product_name" defaultValue={v(defaults.product_name)} required maxLength={200} className="sm:col-span-2" />
        <TextField label="商品名カナ" name="product_name_kana" defaultValue={v(defaults.product_name_kana)} maxLength={200} className="sm:col-span-2" />
        <TextField label="メーカー" name="manufacturer" defaultValue={v(defaults.manufacturer)} maxLength={100} />
        <TextField label="ブランド" name="brand" defaultValue={v(defaults.brand)} maxLength={100} />
      </Section>

      <Section title="分類・規格">
        <SelectField
          label="カテゴリ（大分類）"
          name="category_id"
          value={categoryId}
          onChange={(event) => setCategoryId(event.target.value)}
          placeholder="未分類"
          options={tops.map((c) => ({ value: c.id, label: c.name }))}
        />
        <SelectField
          key={categoryId}
          label="小分類"
          name="subcategory_id"
          defaultValue={categoryId === defaults.category_id ? v(defaults.subcategory_id) : ""}
          placeholder={categoryId ? "指定なし" : "先にカテゴリを選択"}
          disabled={!categoryId}
          options={subs.map((c) => ({ value: c.id, label: c.name }))}
        />
        <TextField label="規格" name="specification" defaultValue={v(defaults.specification)} maxLength={200} className="sm:col-span-2" placeholder="例: ペットボトル 2L（6本/ケース）" />
        <TextField label="内容量" name="content_amount" type="number" step="0.001" min={0} defaultValue={v(defaults.content_amount)} />
        <TextField label="内容量単位" name="content_unit" defaultValue={v(defaults.content_unit)} maxLength={20} placeholder="ml / g / 枚" />
        <TextField label="販売単位" name="sales_unit" defaultValue={v(defaults.sales_unit ?? "個")} required maxLength={20} />
        <TextField label="仕入単位" name="purchase_unit" defaultValue={v(defaults.purchase_unit ?? "ケース")} required maxLength={20} />
        <TextField label="ケース入数" name="units_per_case" type="number" min={1} step={1} defaultValue={v(defaults.units_per_case ?? 1)} required />
      </Section>

      <Section title="価格・税">
        <TextField label="原価（円）" name="cost_price" type="number" min={0} step="0.01" defaultValue={v(defaults.cost_price ?? 0)} required />
        <TextField label="売価（円）" name="selling_price" type="number" min={0} step="0.01" defaultValue={v(defaults.selling_price ?? 0)} required />
        <SelectField
          label="税率"
          name="tax_rate"
          defaultValue={v(defaults.tax_rate ?? 8)}
          options={[
            { value: "8", label: "8%（軽減税率）" },
            { value: "10", label: "10%" },
            { value: "0", label: "0%" },
          ]}
        />
      </Section>

      <Section title="保存・賞味期限">
        <SelectField
          label="保存区分"
          name="storage_type"
          defaultValue={v(defaults.storage_type ?? "room_temperature")}
          required
          options={[
            { value: "room_temperature", label: "常温" },
            { value: "refrigerated", label: "冷蔵" },
            { value: "frozen", label: "冷凍" },
          ]}
        />
        <TextField label="保存温度 下限（℃）" name="storage_temperature_min" type="number" step="0.1" defaultValue={v(defaults.storage_temperature_min)} />
        <TextField label="保存温度 上限（℃）" name="storage_temperature_max" type="number" step="0.1" defaultValue={v(defaults.storage_temperature_max)} />
        <TextField label="賞味期間（日）" name="shelf_life_days" type="number" min={1} step={1} defaultValue={v(defaults.shelf_life_days)} hint="製造日からの日数" />
        <TextField
          label="期限アラート（日前）"
          name="expiration_warning_days"
          type="number"
          min={0}
          step={1}
          defaultValue={v(defaults.expiration_warning_days ?? 3)}
          required
        />
        <TextField label="保管場所メモ" name="storage_location_note" defaultValue={v(defaults.storage_location_note)} maxLength={200} className="sm:col-span-3" />
      </Section>

      <Section title="発注設定" description="AI発注提案の計算に使用します。発注点は安全在庫以上、標準発注数は発注単位の倍数で設定してください。">
        <TextField label="安全在庫" name="safety_stock" type="number" min={0} step="0.001" defaultValue={v(defaults.safety_stock ?? 0)} required />
        <TextField label="発注点" name="reorder_point" type="number" min={0} step="0.001" defaultValue={v(defaults.reorder_point ?? 0)} required />
        <TextField label="標準発注数" name="standard_order_quantity" type="number" min={0} step="0.001" defaultValue={v(defaults.standard_order_quantity ?? 0)} required />
        <TextField label="リードタイム（日）" name="lead_time_days" type="number" min={0} step={1} defaultValue={v(defaults.lead_time_days ?? 2)} required />
        <TextField label="最小発注数量" name="minimum_order_quantity" type="number" min={0} step="0.001" defaultValue={v(defaults.minimum_order_quantity ?? 1)} required />
        <TextField label="発注単位" name="order_lot_size" type="number" min={0.001} step="0.001" defaultValue={v(defaults.order_lot_size ?? 1)} required hint="ケース発注ならケース入数" />
        <SelectField
          label="主要仕入先"
          name="primary_supplier_id"
          defaultValue={v(defaults.primary_supplier_id)}
          placeholder="未設定"
          options={suppliers.map((s) => ({ value: s.id, label: s.label }))}
          className="sm:col-span-2"
          hint="AI発注提案から発注書を作成するときの発注先"
        />
      </Section>

      <fieldset className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
        <legend className="px-1 text-sm font-semibold text-slate-900">その他</legend>
        <div className="space-y-4">
          <TextareaField label="備考" name="notes" defaultValue={v(defaults.notes)} maxLength={2000} />
          <CheckboxField label="有効な商品" name="is_active" defaultChecked={defaults.is_active ?? true} hint="無効にすると発注提案・発注・棚卸の対象外になります（履歴は残ります）。" />
        </div>
      </fieldset>

      <div className="flex flex-wrap justify-end gap-2">
        <ButtonLink href={cancelHref} variant="secondary">
          キャンセル
        </ButtonLink>
        <SubmitButton pendingLabel="保存中…">{submitLabel}</SubmitButton>
      </div>
    </ActionForm>
  );
}
