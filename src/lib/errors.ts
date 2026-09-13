/**
 * DB / Supabase のエラーを利用者向けの日本語メッセージに変換する。
 * 内部情報（SQL・制約名など）はそのまま表示せず、サーバーログにだけ残す。
 */

export type DbErrorLike = {
  code?: string | null;
  message?: string | null;
  details?: string | null;
  hint?: string | null;
};

const JAPANESE = /[぀-ヿ一-龯]/;

const UNIQUE_MESSAGES: [RegExp, string][] = [
  [/products_organization_id_sku_key/, "このSKUはすでに登録されています。"],
  [/products_org_jan_uidx/, "このJANコードはすでに登録されています。"],
  [/suppliers_organization_id_code_key/, "この仕入先コードはすでに登録されています。"],
  [/locations_organization_id_code_key/, "この拠点コードはすでに登録されています。"],
  [/categories_organization_id_code_key/, "このカテゴリコードはすでに登録されています。"],
  [/stocktakes_one_in_progress_uidx/, "この拠点には進行中の棚卸があります。"],
];

export const GENERIC_ERROR_MESSAGE = "処理に失敗しました。時間をおいて再度お試しください。";

export function toUserMessage(error: DbErrorLike | null | undefined, fallback = GENERIC_ERROR_MESSAGE): string {
  if (!error) return fallback;
  const code = error.code ?? "";
  const message = error.message ?? "";

  switch (code) {
    case "P0001":
      return JAPANESE.test(message) ? message : fallback;
    case "42501":
      return JAPANESE.test(message) ? message : "この操作を行う権限がありません。";
    case "28000":
      return "ログインが必要です。再度ログインしてください。";
    case "23505": {
      const target = `${message} ${error.details ?? ""}`;
      const match = UNIQUE_MESSAGES.find(([pattern]) => pattern.test(target));
      return match ? match[1] : "同じコードまたは番号がすでに登録されています。";
    }
    case "23503":
      return "関連するデータが存在するため、この操作は実行できません。";
    case "23514":
      return "入力値が許容範囲外です。入力内容を確認してください。";
    case "22P02":
    case "22007":
    case "22008":
      return "入力値の形式が正しくありません。";
    case "40001":
    case "40P01":
      return "他の操作と競合しました。もう一度お試しください。";
    case "PGRST116":
      return "対象のデータが見つかりません。";
    case "PGRST301":
    case "PGRST303":
      return "セッションの有効期限が切れました。再度ログインしてください。";
    default:
      if (/row-level security/i.test(message)) return "この操作を行う権限がありません。";
      return fallback;
  }
}

/** サーバーログ用（利用者には表示しない） */
export function logDbError(scope: string, error: DbErrorLike | null | undefined) {
  if (!error) return;
  console.error(`[db] ${scope}`, {
    code: error.code,
    message: error.message,
    details: error.details,
    hint: error.hint,
  });
}
