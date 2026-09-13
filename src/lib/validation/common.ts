import { z } from "zod";

/**
 * フォーム入力（文字列）を安全に数値へ変換するスキーマ群。
 * 空文字は未入力、"abc" や NaN・Infinity は形式エラーとして扱う。
 */

function toNumberInput(value: unknown): unknown {
  if (typeof value === "string") {
    const trimmed = value.normalize("NFKC").trim().replaceAll(",", "");
    if (trimmed === "") return undefined;
    return Number(trimmed);
  }
  if (value === null) return undefined;
  return value;
}

type NumberOptions = { min?: number; max?: number; int?: boolean; positive?: boolean };

function buildNumber(label: string, options: NumberOptions) {
  let schema = z.number({
    error: (issue) =>
      issue.input === undefined ? `${label}を入力してください。` : `${label}は数値で入力してください。`,
  });
  if (options.int) schema = schema.int(`${label}は整数で入力してください。`);
  if (options.positive) schema = schema.gt(0, `${label}は0より大きい値を入力してください。`);
  if (options.min !== undefined) schema = schema.min(options.min, `${label}は${options.min}以上で入力してください。`);
  if (options.max !== undefined) schema = schema.max(options.max, `${label}は${options.max}以下で入力してください。`);
  return schema;
}

export function requiredNumber(label: string, options: NumberOptions = {}) {
  return z.preprocess(toNumberInput, buildNumber(label, options));
}

export function optionalNumber(label: string, options: NumberOptions = {}) {
  return z.preprocess(toNumberInput, buildNumber(label, options).optional());
}

/** 数量: 0以上・小数3桁まで */
export function quantity(label = "数量", options: { positive?: boolean } = {}) {
  return requiredNumber(label, { min: 0, max: 99_999_999, positive: options.positive }).refine(
    (value) => Number.isInteger(Math.round(value * 1000)) && Math.abs(value * 1000 - Math.round(value * 1000)) < 1e-6,
    `${label}は小数点以下3桁までで入力してください。`,
  );
}

/** 金額: 0以上・小数2桁まで */
export function price(label: string) {
  return requiredNumber(label, { min: 0, max: 9_999_999_999 }).refine(
    (value) => Math.abs(value * 100 - Math.round(value * 100)) < 1e-6,
    `${label}は小数点以下2桁までで入力してください。`,
  );
}

export function optionalPrice(label: string) {
  return optionalNumber(label, { min: 0, max: 9_999_999_999 }).refine(
    (value) => value === undefined || Math.abs(value * 100 - Math.round(value * 100)) < 1e-6,
    `${label}は小数点以下2桁までで入力してください。`,
  );
}

function toOptionalString(value: unknown): unknown {
  if (typeof value !== "string") return value ?? undefined;
  const trimmed = value.trim();
  return trimmed === "" ? undefined : trimmed;
}

export function requiredText(label: string, max: number) {
  return z
    .string({ error: `${label}を入力してください。` })
    .trim()
    .min(1, `${label}を入力してください。`)
    .max(max, `${label}は${max}文字以内で入力してください。`);
}

export function optionalText(label: string, max: number) {
  return z.preprocess(
    toOptionalString,
    z.string().max(max, `${label}は${max}文字以内で入力してください。`).optional(),
  );
}

export function uuid(label: string) {
  return z.uuid({ error: `${label}を選択してください。` });
}

export function optionalUuid(label: string) {
  return z.preprocess(toOptionalString, z.uuid({ error: `${label}の指定が正しくありません。` }).optional());
}

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export function isValidDateString(value: string): boolean {
  if (!DATE_PATTERN.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

export function dateString(label: string) {
  return z
    .string({ error: `${label}を入力してください。` })
    .trim()
    .min(1, `${label}を入力してください。`)
    .refine(isValidDateString, `${label}は正しい日付で入力してください。`);
}

export function optionalDateString(label: string) {
  return z.preprocess(
    toOptionalString,
    z.string().refine(isValidDateString, `${label}は正しい日付で入力してください。`).optional(),
  );
}

export function checkbox() {
  return z.preprocess((value) => value === "on" || value === "true" || value === true, z.boolean());
}

export const SKU_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]{2,39}$/;
export const CODE_PATTERN = /^[A-Za-z0-9_-]{1,20}$/;
export const POSTAL_CODE_PATTERN = /^\d{3}-?\d{4}$/;
export const PHONE_PATTERN = /^[0-9+() -]{6,20}$/;

/** JAN（EAN-13 / EAN-8）のチェックデジット検証 */
export function isValidJanCode(code: string): boolean {
  if (!/^(\d{8}|\d{13})$/.test(code)) return false;
  return calculateJanCheckDigit(code.slice(0, -1)) === Number(code.at(-1));
}

/** チェックデジット以外の桁（7桁または12桁）からチェックデジットを計算 */
export function calculateJanCheckDigit(body: string): number {
  let sum = 0;
  const digits = body.split("").reverse();
  digits.forEach((digit, index) => {
    sum += Number(digit) * (index % 2 === 0 ? 3 : 1);
  });
  return (10 - (sum % 10)) % 10;
}

export type FieldErrors = Record<string, string[] | undefined>;

export type ActionResult<T = undefined> =
  | { ok: true; message: string; data?: T; redirectTo?: string }
  | { ok: false; message: string; fieldErrors?: FieldErrors };

/** Zod のエラーをフィールドごとのメッセージにまとめる（ネストしたパスは "items.0.quantity" 形式） */
export function toFieldErrors(error: z.ZodError): FieldErrors {
  const result: FieldErrors = {};
  for (const issue of error.issues) {
    const key = issue.path.length > 0 ? issue.path.map(String).join(".") : "_form";
    (result[key] ??= []).push(issue.message);
  }
  return result;
}

export function validationFailure(error: z.ZodError): { ok: false; message: string; fieldErrors: FieldErrors } {
  return {
    ok: false,
    message: error.issues[0]?.message ?? "入力内容を確認してください。",
    fieldErrors: toFieldErrors(error),
  };
}

export function formDataToObject(formData: FormData): Record<string, string> {
  const result: Record<string, string> = {};
  for (const [key, value] of formData.entries()) {
    if (key.startsWith("$ACTION")) continue;
    if (typeof value === "string") result[key] = value;
  }
  return result;
}

/** hidden input に入れた JSON を安全にパース */
export function parseJsonField(value: FormDataEntryValue | null): unknown {
  if (typeof value !== "string" || value.length === 0 || value.length > 500_000) return undefined;
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return undefined;
  }
}
