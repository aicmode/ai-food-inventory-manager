/**
 * 日本向けの日付・金額・数量フォーマット（Asia/Tokyo / 円 / YYYY/MM/DD）。
 */

export const TIME_ZONE = "Asia/Tokyo";

const dateFormatter = new Intl.DateTimeFormat("ja-JP", {
  timeZone: TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

const dateTimeFormatter = new Intl.DateTimeFormat("ja-JP", {
  timeZone: TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

const isoDateFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

const currencyFormatter = new Intl.NumberFormat("ja-JP", {
  style: "currency",
  currency: "JPY",
  maximumFractionDigits: 0,
});

const preciseCurrencyFormatter = new Intl.NumberFormat("ja-JP", {
  style: "currency",
  currency: "JPY",
  minimumFractionDigits: 0,
  maximumFractionDigits: 2,
});

const quantityFormatter = new Intl.NumberFormat("ja-JP", { maximumFractionDigits: 3 });
const decimalFormatter = new Intl.NumberFormat("ja-JP", { maximumFractionDigits: 1 });

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

/** 今日の日付（Asia/Tokyo）YYYY-MM-DD */
export function todayJst(now: Date = new Date()): string {
  return isoDateFormatter.format(now);
}

/** YYYY/MM/DD。日付のみの文字列はタイムゾーン変換しない */
export function formatDate(value: string | Date | null | undefined): string {
  if (value === null || value === undefined || value === "") return "—";
  if (typeof value === "string" && DATE_ONLY.test(value)) return value.replaceAll("-", "/");
  const date = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return "—";
  return dateFormatter.format(date);
}

/** YYYY/MM/DD HH:mm（Asia/Tokyo） */
export function formatDateTime(value: string | Date | null | undefined): string {
  if (value === null || value === undefined || value === "") return "—";
  const date = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return "—";
  return dateTimeFormatter.format(date);
}

/** MM/DD（チャート軸用） */
export function formatMonthDay(value: string): string {
  return DATE_ONLY.test(value) ? `${value.slice(5, 7)}/${value.slice(8, 10)}` : value;
}

export function formatCurrency(value: number | null | undefined, precise = false): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "—";
  return (precise ? preciseCurrencyFormatter : currencyFormatter).format(value);
}

export function formatQuantity(value: number | null | undefined, unit?: string): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "—";
  return unit ? `${quantityFormatter.format(value)} ${unit}` : quantityFormatter.format(value);
}

export function formatDecimal(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "—";
  return decimalFormatter.format(value);
}

export function formatPercent(ratio: number | null | undefined, digits = 1): string {
  if (ratio === null || ratio === undefined || !Number.isFinite(ratio)) return "—";
  return `${(ratio * 100).toFixed(digits)}%`;
}

/** 期限までの日数（負は期限切れ） */
export function daysUntil(date: string, today: string = todayJst()): number {
  return Math.round((Date.parse(`${date}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86_400_000);
}

/** 全角英数・半角カナを正規化し、ひらがなをカタカナに変換（商品カナ検索用） */
export function normalizeSearchQuery(query: string): { primary: string; kana: string | null } {
  const primary = query.normalize("NFKC").trim().slice(0, 100);
  const kana = primary.replace(/[ぁ-ゖ]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) + 0x60));
  return { primary, kana: kana !== primary ? kana : null };
}
