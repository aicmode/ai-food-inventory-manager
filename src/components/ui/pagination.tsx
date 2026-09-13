import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";

export const PAGE_SIZE = 50;

export function parsePage(value: string | string[] | undefined): number {
  const raw = Array.isArray(value) ? value[0] : value;
  const page = Number(raw);
  return Number.isInteger(page) && page >= 1 && page <= 10_000 ? page : 1;
}

function hrefFor(basePath: string, params: Record<string, string | undefined>, page: number): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== "" && key !== "page") search.set(key, value);
  }
  if (page > 1) search.set("page", String(page));
  const query = search.toString();
  return query ? `${basePath}?${query}` : basePath;
}

export function Pagination({
  basePath,
  params,
  page,
  pageSize = PAGE_SIZE,
  total,
}: {
  basePath: string;
  params: Record<string, string | undefined>;
  page: number;
  pageSize?: number;
  total: number;
}) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(total, page * pageSize);
  const linkClass =
    "inline-flex h-8 items-center gap-1 rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-700 hover:bg-slate-50";
  const disabledClass = "inline-flex h-8 items-center gap-1 rounded-md border border-slate-200 px-3 text-sm text-slate-300";

  return (
    <nav aria-label="ページ送り" className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 px-4 py-3">
      <p className="text-xs text-slate-600 tabular">
        全 {total.toLocaleString("ja-JP")} 件中 {from.toLocaleString("ja-JP")}〜{to.toLocaleString("ja-JP")} 件
      </p>
      <div className="flex items-center gap-2">
        {page > 1 ? (
          <Link href={hrefFor(basePath, params, page - 1)} className={linkClass} rel="prev">
            <ChevronLeft className="size-4" aria-hidden="true" />
            前へ
          </Link>
        ) : (
          <span className={disabledClass} aria-disabled="true">
            <ChevronLeft className="size-4" aria-hidden="true" />
            前へ
          </span>
        )}
        <span className="text-xs text-slate-600 tabular" aria-current="page">
          {page} / {totalPages}
        </span>
        {page < totalPages ? (
          <Link href={hrefFor(basePath, params, page + 1)} className={linkClass} rel="next">
            次へ
            <ChevronRight className="size-4" aria-hidden="true" />
          </Link>
        ) : (
          <span className={disabledClass} aria-disabled="true">
            次へ
            <ChevronRight className="size-4" aria-hidden="true" />
          </span>
        )}
      </div>
    </nav>
  );
}
