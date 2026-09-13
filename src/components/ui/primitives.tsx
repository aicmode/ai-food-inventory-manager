import Link from "next/link";
import { AlertOctagon, AlertTriangle, CheckCircle2, Circle, Info, type LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

import type { Tone } from "@/lib/labels";

// -----------------------------------------------------------------------------
// Badge（色だけに頼らず、アイコンとテキストで状態を伝える）
// -----------------------------------------------------------------------------
const TONE_CLASSES: Record<Tone, string> = {
  neutral: "bg-slate-100 text-slate-700 ring-slate-300",
  info: "bg-blue-50 text-blue-800 ring-blue-200",
  success: "bg-emerald-50 text-emerald-800 ring-emerald-200",
  warning: "bg-amber-50 text-amber-900 ring-amber-300",
  danger: "bg-red-50 text-red-800 ring-red-200",
  critical: "bg-red-700 text-white ring-red-700",
};

const TONE_ICONS: Record<Tone, LucideIcon> = {
  neutral: Circle,
  info: Info,
  success: CheckCircle2,
  warning: AlertTriangle,
  danger: AlertTriangle,
  critical: AlertOctagon,
};

export function Badge({ tone = "neutral", children, icon = true }: { tone?: Tone; children: ReactNode; icon?: boolean }) {
  const Icon = TONE_ICONS[tone];
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap ring-1 ring-inset ${TONE_CLASSES[tone]}`}
    >
      {icon ? <Icon className="size-3" aria-hidden="true" /> : null}
      {children}
    </span>
  );
}

// -----------------------------------------------------------------------------
// Card
// -----------------------------------------------------------------------------
export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <section className={`rounded-lg border border-slate-200 bg-white shadow-sm ${className}`}>{children}</section>;
}

export function CardHeader({
  title,
  description,
  action,
  headingLevel = 2,
}: {
  title: string;
  description?: ReactNode;
  action?: ReactNode;
  headingLevel?: 2 | 3;
}) {
  const Heading = headingLevel === 2 ? "h2" : "h3";
  return (
    <div className="flex flex-wrap items-start justify-between gap-2 border-b border-slate-100 px-4 py-3">
      <div className="min-w-0">
        <Heading className="text-sm font-semibold text-slate-900">{title}</Heading>
        {description ? <p className="mt-0.5 text-xs text-slate-500">{description}</p> : null}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}

export function CardBody({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`p-4 ${className}`}>{children}</div>;
}

// -----------------------------------------------------------------------------
// Page header
// -----------------------------------------------------------------------------
export function PageHeader({
  title,
  description,
  actions,
  breadcrumbs,
}: {
  title: string;
  description?: ReactNode;
  actions?: ReactNode;
  breadcrumbs?: { href: string; label: string }[];
}) {
  return (
    <div className="mb-6">
      {breadcrumbs && breadcrumbs.length > 0 ? (
        <nav aria-label="パンくずリスト" className="mb-2 text-xs text-slate-500">
          <ol className="flex flex-wrap items-center gap-1">
            {breadcrumbs.map((crumb) => (
              <li key={crumb.href} className="flex items-center gap-1">
                <Link href={crumb.href} className="hover:text-slate-800 hover:underline">
                  {crumb.label}
                </Link>
                <span aria-hidden="true">/</span>
              </li>
            ))}
          </ol>
        </nav>
      ) : null}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-xl font-semibold text-slate-900 sm:text-2xl">{title}</h1>
          {description ? <p className="mt-1 text-sm text-slate-600">{description}</p> : null}
        </div>
        {actions ? <div className="flex flex-wrap gap-2">{actions}</div> : null}
      </div>
    </div>
  );
}

// -----------------------------------------------------------------------------
// KPI（stat tile）
// -----------------------------------------------------------------------------
export function StatTile({
  label,
  value,
  sub,
  href,
  tone,
  icon: Icon,
}: {
  label: string;
  value: string;
  sub?: ReactNode;
  href?: string;
  tone?: Tone;
  icon?: LucideIcon;
}) {
  const accent =
    tone === "critical" || tone === "danger"
      ? "text-red-700"
      : tone === "warning"
        ? "text-amber-700"
        : tone === "success"
          ? "text-emerald-700"
          : "text-slate-500";
  const content = (
    <>
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-medium text-slate-600">{label}</p>
        {Icon ? <Icon className={`size-4 ${accent}`} aria-hidden="true" /> : null}
      </div>
      <p className="mt-2 text-xl font-semibold break-all text-slate-900 sm:text-2xl">{value}</p>
      {sub ? <p className="mt-1 text-xs text-slate-500">{sub}</p> : null}
    </>
  );
  const base = "block rounded-lg border border-slate-200 bg-white p-4 shadow-sm";
  if (href) {
    return (
      <Link href={href} className={`${base} transition-colors hover:border-slate-300 hover:bg-slate-50`}>
        {content}
      </Link>
    );
  }
  return <div className={base}>{content}</div>;
}

// -----------------------------------------------------------------------------
// Empty / Error / Skeleton
// -----------------------------------------------------------------------------
export function EmptyState({
  icon: Icon = Info,
  title,
  description,
  action,
}: {
  icon?: LucideIcon;
  title: string;
  description?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center px-4 py-12 text-center">
      <Icon className="size-10 text-slate-300" aria-hidden="true" />
      <p className="mt-3 text-sm font-semibold text-slate-800">{title}</p>
      {description ? <p className="mt-1 max-w-md text-sm text-slate-500">{description}</p> : null}
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}

export function Alert({ tone = "info", title, children }: { tone?: Tone; title?: string; children?: ReactNode }) {
  const Icon = TONE_ICONS[tone];
  const classes =
    tone === "danger" || tone === "critical"
      ? "border-red-200 bg-red-50 text-red-900"
      : tone === "warning"
        ? "border-amber-300 bg-amber-50 text-amber-900"
        : tone === "success"
          ? "border-emerald-200 bg-emerald-50 text-emerald-900"
          : "border-blue-200 bg-blue-50 text-blue-900";
  return (
    <div role={tone === "danger" || tone === "critical" ? "alert" : "status"} className={`flex gap-3 rounded-md border px-4 py-3 text-sm ${classes}`}>
      <Icon className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
      <div className="min-w-0">
        {title ? <p className="font-semibold">{title}</p> : null}
        {children ? <div className={title ? "mt-1" : ""}>{children}</div> : null}
      </div>
    </div>
  );
}

export function Skeleton({ className = "" }: { className?: string }) {
  return <div className={`animate-pulse rounded bg-slate-200 ${className}`} aria-hidden="true" />;
}

// -----------------------------------------------------------------------------
// Description list（詳細画面）
// -----------------------------------------------------------------------------
export function DetailList({ items, columns = 2 }: { items: { label: string; value: ReactNode }[]; columns?: 2 | 3 }) {
  return (
    <dl className={`grid grid-cols-1 gap-x-6 gap-y-3 ${columns === 3 ? "sm:grid-cols-2 lg:grid-cols-3" : "sm:grid-cols-2"}`}>
      {items.map((item) => (
        <div key={item.label} className="min-w-0">
          <dt className="text-xs text-slate-500">{item.label}</dt>
          <dd className="mt-0.5 text-sm break-words text-slate-900">{item.value ?? "—"}</dd>
        </div>
      ))}
    </dl>
  );
}

// -----------------------------------------------------------------------------
// Table helpers（セマンティックな table + 横スクロール）
// -----------------------------------------------------------------------------
export function TableContainer({ caption, children }: { caption: string; children: ReactNode }) {
  return (
    <div className="overflow-x-auto">
      <table className="min-w-full divide-y divide-slate-200 text-sm">
        <caption className="sr-only">{caption}</caption>
        {children}
      </table>
    </div>
  );
}

export const th = "px-3 py-2 text-left text-xs font-semibold whitespace-nowrap text-slate-600 bg-slate-50";
export const thRight = "px-3 py-2 text-right text-xs font-semibold whitespace-nowrap text-slate-600 bg-slate-50";
export const td = "px-3 py-2 align-top text-slate-800";
export const tdRight = "px-3 py-2 align-top text-right tabular whitespace-nowrap text-slate-800";
export const tr = "border-t border-slate-100 hover:bg-slate-50/70";
