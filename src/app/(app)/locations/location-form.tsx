"use client";

import { ActionForm, CheckboxField, SelectField, SubmitButton, TextField, type FormAction } from "@/components/ui/action-form";
import { ButtonLink } from "@/components/ui/button";

export type LocationDefaults = {
  code?: string;
  name?: string;
  type?: string;
  postal_code?: string | null;
  prefecture?: string | null;
  city?: string | null;
  address?: string | null;
  phone?: string | null;
  is_active?: boolean;
};

const v = (value: string | null | undefined) => value ?? "";

export function LocationForm({ action, defaults = {}, submitLabel, editing }: { action: FormAction; defaults?: LocationDefaults; submitLabel: string; editing: boolean }) {
  return (
    <ActionForm action={action} refreshOnSuccess={false} resetOnSuccess={!editing} className="space-y-4">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <TextField label="拠点コード" name="code" defaultValue={v(defaults.code)} required maxLength={20} placeholder="TYO" />
        <TextField label="拠点名" name="name" defaultValue={v(defaults.name)} required maxLength={100} />
        <SelectField
          label="種別"
          name="type"
          defaultValue={defaults.type ?? "store"}
          options={[
            { value: "store", label: "店舗" },
            { value: "warehouse", label: "倉庫" },
          ]}
        />
        <TextField label="電話番号" name="phone" type="tel" defaultValue={v(defaults.phone)} maxLength={20} />
        <TextField label="郵便番号" name="postal_code" defaultValue={v(defaults.postal_code)} maxLength={8} />
        <TextField label="都道府県" name="prefecture" defaultValue={v(defaults.prefecture)} maxLength={10} />
        <TextField label="市区町村" name="city" defaultValue={v(defaults.city)} maxLength={100} />
        <TextField label="住所" name="address" defaultValue={v(defaults.address)} maxLength={200} />
      </div>
      <CheckboxField label="稼働中（有効）" name="is_active" defaultChecked={defaults.is_active ?? true} hint="無効にすると入出庫・発注・棚卸の対象から外れます（履歴は残ります）。" />
      <div className="flex justify-end gap-2">
        {editing ? (
          <ButtonLink href="/locations" variant="secondary">
            キャンセル
          </ButtonLink>
        ) : null}
        <SubmitButton pendingLabel="保存中…">{submitLabel}</SubmitButton>
      </div>
    </ActionForm>
  );
}
