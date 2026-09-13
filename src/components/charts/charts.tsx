"use client";

import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";

/**
 * 依存ライブラリなしの軽量 SVG チャート。
 * - 細いマーク（線 2px / 棒 最大24px・先端4px角丸）、控えめなグリッド
 * - ホバー / フォーカスでツールチップ（値は凡例・ラベル・スクリーンリーダー用テーブルでも参照可能）
 * - 系列色は固定順（dataviz リファレンスパレット）
 */

const nf = new Intl.NumberFormat("ja-JP", { maximumFractionDigits: 1 });
const compact = new Intl.NumberFormat("ja-JP", { notation: "compact", maximumFractionDigits: 1 });
const yen = new Intl.NumberFormat("ja-JP", { style: "currency", currency: "JPY", maximumFractionDigits: 0 });

/** Server Component から関数は渡せないため、値の書式はキーで指定する */
export type ValueFormat = "currency" | "count" | "quantity";

function formatBy(format: ValueFormat, value: number): string {
  if (format === "currency") return yen.format(value);
  if (format === "count") return `${value.toLocaleString("ja-JP")} 件`;
  return nf.format(value);
}

/** YYYY-MM-DD → M/D */
function formatMonthDay(value: string): string {
  return /^\d{4}-\d{2}-\d{2}/.test(value) ? `${Number(value.slice(5, 7))}/${Number(value.slice(8, 10))}` : value;
}

function useWidth(initial = 640) {
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(initial);
  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    const observer = new ResizeObserver((entries) => {
      const next = Math.round(entries[0]?.contentRect.width ?? initial);
      if (next > 0) setWidth(next);
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, [initial]);
  return { ref, width };
}

function niceMax(value: number): number {
  if (value <= 0) return 1;
  const exponent = 10 ** Math.floor(Math.log10(value));
  const fraction = value / exponent;
  const nice = fraction <= 1 ? 1 : fraction <= 2 ? 2 : fraction <= 2.5 ? 2.5 : fraction <= 5 ? 5 : 10;
  return nice * exponent;
}

function ticks(max: number, count = 4): number[] {
  return Array.from({ length: count + 1 }, (_, index) => (max / count) * index);
}

// -----------------------------------------------------------------------------
// 折れ線（クロスヘア + 全系列ツールチップ）
// -----------------------------------------------------------------------------
export type LineSeries = { key: string; label: string; color: string };

export function LineChart({
  title,
  data,
  xKey,
  series,
  unit,
  height = 240,
}: {
  title: string;
  data: Record<string, number | string>[];
  xKey: string;
  series: LineSeries[];
  unit: string;
  height?: number;
}) {
  const formatX = formatMonthDay;
  const { ref, width } = useWidth();
  const [hover, setHover] = useState<number | null>(null);
  const margin = { top: 12, right: 16, bottom: 28, left: 52 };
  const innerWidth = Math.max(10, width - margin.left - margin.right);
  const innerHeight = height - margin.top - margin.bottom;
  const max = niceMax(Math.max(0, ...data.flatMap((d) => series.map((s) => Number(d[s.key]) || 0))));
  const x = (index: number) => margin.left + (data.length <= 1 ? 0 : (index / (data.length - 1)) * innerWidth);
  const y = (value: number) => margin.top + innerHeight - (value / max) * innerHeight;
  const labelEvery = Math.max(1, Math.ceil(data.length / Math.max(2, Math.floor(innerWidth / 70))));

  function onPointer(event: ReactPointerEvent<SVGRectElement>) {
    const rect = event.currentTarget.getBoundingClientRect();
    const ratio = (event.clientX - rect.left) / rect.width;
    setHover(Math.min(data.length - 1, Math.max(0, Math.round(ratio * (data.length - 1)))));
  }

  const hovered = hover !== null ? data[hover] : null;

  return (
    <div>
      <ul className="mb-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-600" aria-label={`${title}の凡例`}>
        {series.map((s) => (
          <li key={s.key} className="flex items-center gap-1.5">
            <span className="inline-block h-0.5 w-4 rounded" style={{ background: s.color }} aria-hidden="true" />
            {s.label}
          </li>
        ))}
      </ul>
      <div ref={ref} className="relative w-full">
        <svg
          width={width}
          height={height}
          role="img"
          aria-label={`${title}（折れ線グラフ）。詳細はこのグラフの表を参照してください。`}
          className="block max-w-full"
        >
          {ticks(max).map((tick) => (
            <g key={tick}>
              <line x1={margin.left} x2={margin.left + innerWidth} y1={y(tick)} y2={y(tick)} stroke="var(--chart-grid)" strokeWidth={1} />
              <text x={margin.left - 8} y={y(tick)} dy="0.32em" textAnchor="end" fontSize={11} fill="var(--chart-muted)" className="tabular">
                {compact.format(tick)}
              </text>
            </g>
          ))}
          {data.map((d, index) =>
            (index % labelEvery === 0 && data.length - 1 - index >= labelEvery / 2) || index === data.length - 1 ? (
              <text key={String(d[xKey])} x={x(index)} y={height - 8} textAnchor="middle" fontSize={11} fill="var(--chart-muted)">
                {formatX(String(d[xKey]))}
              </text>
            ) : null,
          )}
          {series.map((s) => (
            <polyline
              key={s.key}
              fill="none"
              stroke={s.color}
              strokeWidth={2}
              strokeLinejoin="round"
              strokeLinecap="round"
              points={data.map((d, index) => `${x(index)},${y(Number(d[s.key]) || 0)}`).join(" ")}
            />
          ))}
          {hover !== null ? (
            <g>
              <line x1={x(hover)} x2={x(hover)} y1={margin.top} y2={margin.top + innerHeight} stroke="var(--chart-axis)" strokeWidth={1} />
              {series.map((s) => (
                <circle key={s.key} cx={x(hover)} cy={y(Number(data[hover][s.key]) || 0)} r={4} fill={s.color} stroke="var(--chart-surface)" strokeWidth={2} />
              ))}
            </g>
          ) : null}
          <rect
            x={margin.left}
            y={margin.top}
            width={innerWidth}
            height={innerHeight}
            fill="transparent"
            onPointerMove={onPointer}
            onPointerLeave={() => setHover(null)}
          />
        </svg>
        {hovered ? (
          <div
            className="pointer-events-none absolute top-2 z-10 min-w-36 rounded-md border border-slate-200 bg-white px-3 py-2 text-xs shadow-lg"
            style={{ left: Math.min(Math.max(0, x(hover ?? 0) + 12), Math.max(0, width - 170)) }}
          >
            <p className="mb-1 text-slate-500">{formatX(String(hovered[xKey]))}</p>
            {series.map((s) => (
              <p key={s.key} className="flex items-center justify-between gap-3">
                <span className="flex items-center gap-1.5 text-slate-600">
                  <span className="inline-block h-0.5 w-3 rounded" style={{ background: s.color }} aria-hidden="true" />
                  {s.label}
                </span>
                <span className="font-semibold text-slate-900 tabular">
                  {nf.format(Number(hovered[s.key]) || 0)} {unit}
                </span>
              </p>
            ))}
          </div>
        ) : null}
      </div>
      <details className="mt-2 text-xs text-slate-600">
        <summary className="cursor-pointer select-none hover:text-slate-900">数値を表で見る</summary>
        <div className="mt-2 max-h-64 overflow-auto rounded border border-slate-200">
      <table className="min-w-full text-xs tabular">
        <caption className="sr-only">{title}</caption>
        <thead>
          <tr>
            <th scope="col">日付</th>
            {series.map((s) => (
              <th key={s.key} scope="col">
                {s.label}（{unit}）
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.map((d) => (
            <tr key={String(d[xKey])}>
              <th scope="row">{formatX(String(d[xKey]))}</th>
              {series.map((s) => (
                <td key={s.key} className="px-2 py-1 text-right">
                  {nf.format(Number(d[s.key]) || 0)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
        </div>
      </details>
    </div>
  );
}

// -----------------------------------------------------------------------------
// 縦棒（単一系列・棒の上に値）
// -----------------------------------------------------------------------------
export function ColumnChart({
  title,
  data,
  color = "var(--series-1)",
  valueFormat,
  height = 220,
}: {
  title: string;
  data: { label: string; value: number }[];
  color?: string;
  valueFormat: ValueFormat;
  height?: number;
}) {
  const formatValue = (value: number) => formatBy(valueFormat, value);
  const { ref, width } = useWidth(360);
  const [hover, setHover] = useState<number | null>(null);
  const margin = { top: 22, right: 8, bottom: 26, left: 8 };
  const innerWidth = Math.max(10, width - margin.left - margin.right);
  const innerHeight = height - margin.top - margin.bottom;
  const max = niceMax(Math.max(0, ...data.map((d) => d.value)));
  const band = innerWidth / Math.max(1, data.length);
  const barWidth = Math.min(24, band * 0.6);
  const radius = 4;

  return (
    <div ref={ref} className="relative w-full">
      <svg width={width} height={height} role="img" aria-label={`${title}（縦棒グラフ）`} className="block max-w-full">
        <line x1={margin.left} x2={margin.left + innerWidth} y1={margin.top + innerHeight} y2={margin.top + innerHeight} stroke="var(--chart-axis)" strokeWidth={1} />
        {data.map((d, index) => {
          const h = max > 0 ? (d.value / max) * innerHeight : 0;
          const cx = margin.left + band * index + band / 2;
          const top = margin.top + innerHeight - h;
          const r = Math.min(radius, h / 2, barWidth / 2);
          const path =
            h > 0
              ? `M${cx - barWidth / 2},${margin.top + innerHeight} V${top + r} Q${cx - barWidth / 2},${top} ${cx - barWidth / 2 + r},${top} H${cx + barWidth / 2 - r} Q${cx + barWidth / 2},${top} ${cx + barWidth / 2},${top + r} V${margin.top + innerHeight} Z`
              : "";
          return (
            <g
              key={d.label}
              tabIndex={0}
              onPointerEnter={() => setHover(index)}
              onPointerLeave={() => setHover(null)}
              onFocus={() => setHover(index)}
              onBlur={() => setHover(null)}
              aria-label={`${d.label}: ${formatValue(d.value)}`}
            >
              <rect x={cx - band / 2} y={margin.top} width={band} height={innerHeight} fill="transparent" />
              {path ? <path d={path} fill={color} opacity={hover === null || hover === index ? 1 : 0.55} /> : null}
              <text x={cx} y={top - 6} textAnchor="middle" fontSize={11} fill="#334155" className="tabular">
                {d.value > 0 ? compact.format(Math.round(d.value)) : "0"}
              </text>
              <text x={cx} y={height - 8} textAnchor="middle" fontSize={11} fill="var(--chart-muted)">
                {d.label}
              </text>
            </g>
          );
        })}
      </svg>
      {hover !== null && data[hover] ? (
        <div className="pointer-events-none absolute top-0 right-0 rounded-md border border-slate-200 bg-white px-3 py-1.5 text-xs shadow">
          <span className="text-slate-500">{data[hover].label}</span>{" "}
          <span className="font-semibold text-slate-900 tabular">{formatValue(data[hover].value)}</span>
        </div>
      ) : null}
    </div>
  );
}

// -----------------------------------------------------------------------------
// 横棒リスト（ラベル + 値を常時表示）
// -----------------------------------------------------------------------------
export function BarList({
  title,
  items,
  valueFormat,
  color = "var(--series-1)",
}: {
  title: string;
  items: { label: string; value: number; color?: string; sub?: string }[];
  valueFormat: ValueFormat;
  color?: string;
}) {
  const formatValue = (value: number) => formatBy(valueFormat, value);
  const max = Math.max(0, ...items.map((item) => item.value));
  return (
    <ul className="space-y-2.5" aria-label={title}>
      {items.map((item) => (
        <li key={item.label} className="group">
          <div className="flex items-baseline justify-between gap-2 text-xs">
            <span className="truncate text-slate-700">
              {item.label}
              {item.sub ? <span className="ml-1 text-slate-500">{item.sub}</span> : null}
            </span>
            <span className="shrink-0 font-semibold text-slate-900 tabular">{formatValue(item.value)}</span>
          </div>
          <div className="mt-1 h-2 w-full rounded-full bg-slate-100" aria-hidden="true">
            <div
              className="h-2 rounded-full transition-opacity group-hover:opacity-80"
              style={{ width: `${max > 0 ? Math.max(1, (item.value / max) * 100) : 0}%`, background: item.color ?? color }}
            />
          </div>
        </li>
      ))}
    </ul>
  );
}
