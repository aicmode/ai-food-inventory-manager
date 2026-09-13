"use client";

import { ActionForm, CheckboxField, SubmitButton, TextField, TextareaField, type FormAction } from "@/components/ui/action-form";
import { ButtonLink } from "@/components/ui/button";

export type SupplierDefaults = {
  code?: string;
  company_name?: string;
  contact_name?: string | null;
  email?: string | null;
  phone?: string | null;
  postal_code?: string | null;
  prefecture?: string | null;
  city?: string | null;
  address?: string | null;
  payment_terms?: string | null;
  minimum_order_amount?: number;
  standard_lead_time_days?: number;
  notes?: string | null;
  is_active?: boolean;
};

const v = (value: string | number | null | undefined) => (value === null || value === undefined ? "" : String(value));

export function SupplierForm({
  action,
  defaults = {},
  submitLabel,
  cancelHref,
}: {
  action: FormAction;
  defaults?: SupplierDefaults;
  submitLabel: string;
  cancelHref: string;
}) {
  return (
    <ActionForm action={action} refreshOnSuccess={false} className="space-y-4">
      <div className="grid grid-cols-1 gap-4 rounded-lg border border-slate-200 bg-white p-4 shadow-sm sm:grid-cols-2 lg:grid-cols-4">
        <TextField label="仕入先コード" name="code" defaultValue={v(defaults.code)} required maxLength={20} placeholder="SUP-041" />
        <TextField label="会社名" name="company_name" defaultValue={v(defaults.company_name)} required maxLength={120} className="sm:col-span-1 lg:col-span-3" />
        <TextField label="担当者名" name="contact_name" defaultValue={v(defaults.contact_name)} maxLength={60} />
        <TextField label="メールアドレス" name="email" type="email" defaultValue={v(defaults.email)} maxLength={254} />
        <TextField label="電話番号" name="phone" type="tel" defaultValue={v(defaults.phone)} maxLength={20} />
        <TextField label="郵便番号" name="postal_code" defaultValue={v(defaults.postal_code)} maxLength={8} placeholder="100-0000" />
        <TextField label="都道府県" name="prefecture" defaultValue={v(defaults.prefecture)} maxLength={10} />
        <TextField label="市区町村" name="city" defaultValue={v(defaults.city)} maxLength={100} />
        <TextField label="住所" name="address" defaultValue={v(defaults.address)} maxLength={200} className="sm:col-span-2" />
        <TextField label="支払条件" name="payment_terms" defaultValue={v(defaults.payment_terms)} maxLength={100} placeholder="月末締め翌月末払い" />
        <TextField label="最低発注金額（円）" name="minimum_order_amount" type="number" min={0} step="1" defaultValue={v(defaults.minimum_order_amount ?? 0)} required />
        <TextField label="標準リードタイム（日）" name="standard_lead_time_days" type="number" min={0} max={180} step="1" defaultValue={v(defaults.standard_lead_time_days ?? 2)} required />
        <TextareaField label="備考" name="notes" defaultValue={v(defaults.notes)} maxLength={2000} className="sm:col-span-2 lg:col-span-4" />
        <div className="sm:col-span-2 lg:col-span-4">
          <CheckboxField label="取引中（有効）" name="is_active" defaultChecked={defaults.is_active ?? true} hint="無効にすると発注書の作成先に選べなくなります。" />
        </div>
      </div>
      <div className="flex justify-end gap-2">
        <ButtonLink href={cancelHref} variant="secondary">
          キャンセル
        </ButtonLink>
        <SubmitButton pendingLabel="保存中…">{submitLabel}</SubmitButton>
      </div>
    </ActionForm>
  );
}
