import "server-only";

import { explanationPreservesQuantity } from "@/lib/ai/guard";
import { buildTemplateExplanation } from "@/lib/domain/reason-text";
import type { RecommendationResult } from "@/lib/domain/recommendation";

/**
 * AI 説明レイヤー（Provider abstraction）。
 *
 * - 数量・リスクは recommendOrder() の決定論的な結果をそのまま使い、AI には説明文だけを書かせる
 * - API キー未設定・タイムアウト・不正な出力のときは定型文（テンプレート）に切り替える
 * - AI へ送るのは商品名・単位・数値指標のみ（組織名・ユーザー情報・仕入単価などは送らない）
 * - このモジュールは server-only。API キーはブラウザへ渡らない
 */

export type ExplanationContext = {
  productName: string;
  unit: string;
  leadTimeDays: number;
  supplierName: string | null;
  result: RecommendationResult;
};

export type ExplanationSource = "ai" | "template";

export type Explanation = {
  text: string;
  source: ExplanationSource;
  /** テンプレートに切り替えた理由（利用者向け） */
  notice?: string;
};

export interface AiProvider {
  readonly name: string;
  generateExplanation(context: ExplanationContext): Promise<string>;
}

const TIMEOUT_MS = 15_000;

class OpenAiCompatibleProvider implements AiProvider {
  readonly name = "openai";

  constructor(
    private readonly apiKey: string,
    private readonly model: string,
    private readonly baseUrl: string,
  ) {}

  async generateExplanation(context: ExplanationContext): Promise<string> {
    const response = await fetch(`${this.baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model: this.model,
        temperature: 0.2,
        max_tokens: 400,
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: JSON.stringify(buildPromptPayload(context)) },
        ],
      }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
      cache: "no-store",
    });

    if (!response.ok) {
      throw new AiProviderError(`AI API がエラーを返しました（HTTP ${response.status}）。`);
    }

    const json: unknown = await response.json();
    const text = extractMessage(json);
    if (!text) throw new AiProviderError("AI API の応答に説明文が含まれていませんでした。");
    return text.trim().slice(0, 1200);
  }
}

export class AiProviderError extends Error {}

const SYSTEM_PROMPT = [
  "あなたは食品小売・飲食店の在庫担当者を支援するアシスタントです。",
  "与えられた発注判定データ（数値はすでにシステムが計算済み）を、業務担当者向けの自然な日本語で3〜4文に要約してください。",
  "制約:",
  "- recommended_quantity の数値を必ずそのまま記載し、数値を変更・再計算・丸めしない",
  "- データにない事実（天候・キャンペーンなど）を推測しない",
  "- 発注推奨数が0の場合は、発注不要の理由を説明する",
  "- 箇条書きや見出しは使わず、です・ます調の文章で書く",
].join("\n");

function buildPromptPayload(context: ExplanationContext) {
  const r = context.result;
  return {
    product_name: context.productName,
    unit: context.unit,
    supplier_lead_time_days: context.leadTimeDays,
    recommended_quantity: r.recommendedQuantity,
    raw_recommended_quantity: r.rawRecommendedQuantity,
    average_daily_usage_7d: r.average7d,
    average_daily_usage_30d: r.average30d,
    weighted_average_daily_usage: r.averageDailyUsage,
    weekday_factor: r.weekdayFactor,
    available_stock: r.availableStock,
    usable_stock: r.usableStock,
    projected_expiring_loss: r.projectedExpiringLoss,
    effective_stock: r.effectiveStock,
    inventory_position: r.inventoryPosition,
    days_of_stock: r.daysOfStock,
    projected_stockout_date: r.stockoutDate,
    coverage_days: r.coverageDays,
    shelf_life_cap_quantity: r.shelfLifeCapQuantity,
    shortage_risk: r.shortageRisk,
    waste_risk: r.wasteRisk,
    waste_rate_30d: r.wasteRate,
    is_overstock: r.isOverstock,
    reason_codes: r.reasons.map((reason) => ({ code: reason.code, ...reason.params })),
  };
}

function extractMessage(json: unknown): string | null {
  if (typeof json !== "object" || json === null || !("choices" in json)) return null;
  const choices = (json as { choices: unknown }).choices;
  if (!Array.isArray(choices) || choices.length === 0) return null;
  const first: unknown = choices[0];
  if (typeof first !== "object" || first === null || !("message" in first)) return null;
  const message = (first as { message: unknown }).message;
  if (typeof message !== "object" || message === null || !("content" in message)) return null;
  const content = (message as { content: unknown }).content;
  return typeof content === "string" ? content : null;
}

export function getAiProvider(): AiProvider | null {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) return null;
  const model = process.env.OPENAI_MODEL?.trim() || "gpt-4o-mini";
  const baseUrl = (process.env.OPENAI_BASE_URL?.trim() || "https://api.openai.com/v1").replace(/\/$/, "");
  return new OpenAiCompatibleProvider(apiKey, model, baseUrl);
}

export function isAiConfigured(): boolean {
  return Boolean(process.env.OPENAI_API_KEY?.trim());
}

export async function explainRecommendation(context: ExplanationContext): Promise<Explanation> {
  const template = buildTemplateExplanation(context.result, context);
  const provider = getAiProvider();
  if (!provider) {
    return { text: template, source: "template", notice: "AI API が未設定のため、定型文で説明しています。" };
  }

  try {
    const text = await provider.generateExplanation(context);
    if (!explanationPreservesQuantity(text, context.result.recommendedQuantity)) {
      return {
        text: template,
        source: "template",
        notice: "AI の説明に推奨数量が正しく含まれていなかったため、定型文を表示しています。",
      };
    }
    return { text, source: "ai" };
  } catch (error) {
    const reason =
      error instanceof AiProviderError
        ? error.message
        : error instanceof Error && error.name === "TimeoutError"
          ? "AI API の応答がタイムアウトしました。"
          : "AI API に接続できませんでした。";
    console.error("[ai] explanation failed", { provider: provider.name, reason });
    return { text: template, source: "template", notice: `${reason}定型文で説明しています。` };
  }
}
