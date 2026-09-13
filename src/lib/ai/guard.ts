/**
 * AI の説明文が、システムが計算した推奨数量をそのまま含んでいるかを検証する。
 * 含まれていない（改変・欠落した）場合は AI の出力を採用しない。
 */
export function explanationPreservesQuantity(text: string, quantity: number): boolean {
  if (!Number.isFinite(quantity)) return false;
  const normalized = text.normalize("NFKC").replaceAll(",", "");
  const plain = String(quantity).replace(".", "\\.");
  return new RegExp(`(^|[^0-9.])${plain}(?![0-9]|\\.[0-9])`).test(normalized);
}
