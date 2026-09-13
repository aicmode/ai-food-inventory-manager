import Link from "next/link";
import { Search } from "lucide-react";
import type { ReactNode } from "react";

import { buttonClasses } from "./button";

const controlClass =
  "block w-full rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-sm text-slate-900 focus:border-emerald-600 focus:ring-1 focus:ring-emerald-600 focus:outline-none";

/**
 * 一覧の検索・絞り込み（GET フォーム。JavaScript なしでも動作し、URL で状態を共有できる）
 */
export function FilterBar({ basePath, children }: { basePath: string; children: ReactNode }) {
  return (
    <form method="get" action={basePath} role="search" className="rounded-lg border border-slate-200 bg-white p-3 shadow-sm">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">{children}</div>
      <div className="mt-3 flex flex-wrap justify-end gap-2">
        <Link href={basePath} className={buttonClasses("ghost", "sm")}>
          条件をクリア
        </Link>
        <button type="submit" className={buttonClasses("primary", "sm")}>
          <Search className="size-4" aria-hidden="true" />
          絞り込む
        </button>
      </div>
    </form>
  );
}

export function FilterText({
  label,
  name,
  value,
  placeholder,
  type = "search",
}: {
  label: string;
  name: string;
  value?: string;
  placeholder?: string;
  type?: "search" | "date";
}) {
  const id = `filter-${name}`;
  return (
    <div>
      <label htmlFor={id} className="mb-1 block text-xs font-medium text-slate-600">
        {label}
      </label>
      <input id={id} name={name} type={type} defaultValue={value} placeholder={placeholder} maxLength={100} className={controlClass} />
    </div>
  );
}

export function FilterSelect({
  label,
  name,
  value,
  options,
  placeholder,
}: {
  label: string;
  name: string;
  value?: string;
  options: { value: string; label: string }[];
  placeholder?: string;
}) {
  const id = `filter-${name}`;
  return (
    <div>
      <label htmlFor={id} className="mb-1 block text-xs font-medium text-slate-600">
        {label}
      </label>
      <select id={id} name={name} defaultValue={value ?? ""} className={controlClass}>
        {placeholder !== undefined ? <option value="">{placeholder}</option> : null}
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </div>
  );
}
