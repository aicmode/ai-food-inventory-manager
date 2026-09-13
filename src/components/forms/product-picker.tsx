"use client";

import { Loader2, Search, X } from "lucide-react";
import { useId, useRef, useState } from "react";

import { searchProductOptionsAction, type ProductOption } from "@/app/(app)/products/actions";

/**
 * 大量 SKU 向けの商品選択コンボボックス（入力に応じてサーバーで検索し、上位20件を表示）。
 * キーボード操作: ↑↓ で候補移動、Enter で選択、Esc で閉じる。
 */
export function ProductPicker({
  label,
  value,
  onChange,
  supplierId,
  error,
  disabled,
}: {
  label: string;
  value: ProductOption | null;
  onChange: (product: ProductOption | null) => void;
  supplierId?: string;
  error?: string;
  disabled?: boolean;
}) {
  const inputId = useId();
  const listId = useId();
  const errorId = useId();
  const [query, setQuery] = useState("");
  const [options, setOptions] = useState<ProductOption[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [active, setActive] = useState(-1);
  const [message, setMessage] = useState<string | null>(null);
  const timer = useRef<number | null>(null);
  const requestId = useRef(0);

  function search(text: string) {
    if (timer.current) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(async () => {
      const current = ++requestId.current;
      setLoading(true);
      try {
        const result = await searchProductOptionsAction(text, supplierId);
        if (current !== requestId.current) return;
        if (result.ok) {
          setOptions(result.data ?? []);
          setMessage(result.data && result.data.length === 0 ? "該当する商品がありません" : null);
        } else {
          setOptions([]);
          setMessage(result.message);
        }
        setActive(-1);
        setOpen(true);
      } catch (caught) {
        console.error("[product-picker] search failed", caught);
        if (current === requestId.current) {
          setOptions([]);
          setMessage("検索に失敗しました。再度入力してください。");
          setOpen(true);
        }
      } finally {
        if (current === requestId.current) setLoading(false);
      }
    }, 250);
  }

  function select(product: ProductOption) {
    onChange(product);
    setOpen(false);
    setQuery("");
    setOptions([]);
  }

  if (value) {
    return (
      <div>
        <p className="mb-1 text-sm font-medium text-slate-700">{label}</p>
        <div className="flex min-h-10 items-center justify-between gap-2 rounded-md border border-slate-300 bg-slate-50 px-3 py-1.5">
          <div className="min-w-0">
            <p className="truncate text-sm font-medium text-slate-900">{value.product_name}</p>
            <p className="font-mono text-xs text-slate-500">{value.sku}</p>
          </div>
          {!disabled ? (
            <button
              type="button"
              onClick={() => onChange(null)}
              className="shrink-0 rounded p-1 text-slate-500 hover:bg-slate-200 hover:text-slate-800"
              aria-label={`${value.product_name}の選択を解除`}
            >
              <X className="size-4" aria-hidden="true" />
            </button>
          ) : null}
        </div>
      </div>
    );
  }

  return (
    <div className="relative">
      <label htmlFor={inputId} className="mb-1 block text-sm font-medium text-slate-700">
        {label}
      </label>
      <div className="relative">
        <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-slate-400" aria-hidden="true" />
        <input
          id={inputId}
          type="text"
          role="combobox"
          aria-expanded={open}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={active >= 0 ? `${listId}-${active}` : undefined}
          aria-invalid={Boolean(error)}
          aria-describedby={error ? errorId : undefined}
          value={query}
          disabled={disabled}
          placeholder="商品名・SKU・JANで検索"
          autoComplete="off"
          onFocus={() => {
            if (options.length === 0) search(query);
            else setOpen(true);
          }}
          onBlur={() => window.setTimeout(() => setOpen(false), 150)}
          onChange={(event) => {
            setQuery(event.target.value);
            search(event.target.value);
          }}
          onKeyDown={(event) => {
            if (event.key === "ArrowDown") {
              event.preventDefault();
              setOpen(true);
              setActive((index) => Math.min(options.length - 1, index + 1));
            } else if (event.key === "ArrowUp") {
              event.preventDefault();
              setActive((index) => Math.max(0, index - 1));
            } else if (event.key === "Enter") {
              if (open && active >= 0 && options[active]) {
                event.preventDefault();
                select(options[active]);
              }
            } else if (event.key === "Escape") {
              setOpen(false);
            }
          }}
          className={`block w-full rounded-md border bg-white py-2 pr-8 pl-8 text-sm focus:border-emerald-600 focus:ring-1 focus:ring-emerald-600 focus:outline-none ${
            error ? "border-red-500" : "border-slate-300"
          }`}
        />
        {loading ? <Loader2 className="absolute top-1/2 right-2.5 size-4 -translate-y-1/2 animate-spin text-slate-400" aria-hidden="true" /> : null}
      </div>
      {open ? (
        <ul
          id={listId}
          role="listbox"
          aria-label={`${label}の候補`}
          className="absolute z-30 mt-1 max-h-72 w-full overflow-auto rounded-md border border-slate-200 bg-white py-1 shadow-lg"
        >
          {message ? <li className="px-3 py-2 text-sm text-slate-500">{message}</li> : null}
          {options.map((option, index) => (
            <li
              key={option.id}
              id={`${listId}-${index}`}
              role="option"
              aria-selected={index === active}
              onMouseDown={(event) => {
                event.preventDefault();
                select(option);
              }}
              onMouseEnter={() => setActive(index)}
              className={`cursor-pointer px-3 py-2 text-sm ${index === active ? "bg-emerald-50" : ""}`}
            >
              <p className="text-slate-900">{option.product_name}</p>
              <p className="font-mono text-xs text-slate-500">{option.sku}</p>
            </li>
          ))}
        </ul>
      ) : null}
      {error ? (
        <p id={errorId} className="mt-1 text-xs text-red-700">
          {error}
        </p>
      ) : null}
    </div>
  );
}
