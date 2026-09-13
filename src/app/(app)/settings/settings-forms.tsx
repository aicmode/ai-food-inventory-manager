"use client";

import { ActionForm, SelectField, SubmitButton, TextField } from "@/components/ui/action-form";

import { createCategoryAction, updateOrganizationAction } from "./actions";

export function OrganizationSettingsForm({
  defaults,
  disabled,
}: {
  defaults: { name: string; reviewPeriodDays: number; overstockDays: number };
  disabled: boolean;
}) {
  return (
    <ActionForm action={updateOrganizationAction} className="space-y-4">
      <fieldset disabled={disabled} className="space-y-4">
        <TextField label="組織名" name="name" defaultValue={defaults.name} required maxLength={100} />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <TextField
            label="発注サイクル（日）"
            name="review_period_days"
            type="number"
            inputMode="numeric"
            min={0}
            max={60}
            defaultValue={defaults.reviewPeriodDays}
            required
            hint="次回発注までの日数。AI発注提案で「リードタイム＋発注サイクル」分の需要を確保します。"
          />
          <TextField
            label="過剰在庫の目安（在庫日数）"
            name="overstock_days"
            type="number"
            inputMode="numeric"
            min={7}
            max={365}
            defaultValue={defaults.overstockDays}
            required
            hint="在庫が平均出庫の何日分を超えたら過剰とみなすか。"
          />
        </div>
        {!disabled ? <SubmitButton>保存する</SubmitButton> : null}
      </fieldset>
    </ActionForm>
  );
}

export function CategoryForm({ parents }: { parents: { value: string; label: string }[] }) {
  return (
    <ActionForm action={createCategoryAction} resetOnSuccess className="grid grid-cols-1 items-end gap-3 sm:grid-cols-2 lg:grid-cols-[1fr_10rem_12rem_6rem_auto]">
      <TextField label="カテゴリ名" name="name" required maxLength={60} />
      <TextField label="コード" name="code" required maxLength={40} placeholder="DRINK-07" />
      <SelectField label="親カテゴリ" name="parent_id" placeholder="なし（大分類）" options={parents} />
      <TextField label="表示順" name="sort_order" type="number" defaultValue={100} min={0} required />
      <SubmitButton variant="secondary">追加</SubmitButton>
    </ActionForm>
  );
}
