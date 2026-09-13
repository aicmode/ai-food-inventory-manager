import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { getAiProvider, isAiConfigured } from "./provider";

const originalMode = process.env.NEXT_PUBLIC_APP_MODE;
const originalKey = process.env.OPENAI_API_KEY;

afterEach(() => {
  if (originalMode === undefined) delete process.env.NEXT_PUBLIC_APP_MODE;
  else process.env.NEXT_PUBLIC_APP_MODE = originalMode;
  if (originalKey === undefined) delete process.env.OPENAI_API_KEY;
  else process.env.OPENAI_API_KEY = originalKey;
});

describe("AI provider", () => {
  it("公開デモではAPIキーが設定されていても外部AIを呼び出さない", () => {
    delete process.env.NEXT_PUBLIC_APP_MODE;
    process.env.OPENAI_API_KEY = "test-key";
    expect(getAiProvider()).toBeNull();
    expect(isAiConfigured()).toBe(false);
  });

  it("Client ProductionではAPIキーがある場合だけAI説明を使う", () => {
    process.env.NEXT_PUBLIC_APP_MODE = "production";
    delete process.env.OPENAI_API_KEY;
    expect(getAiProvider()).toBeNull();
    process.env.OPENAI_API_KEY = "test-key";
    expect(getAiProvider()?.name).toBe("openai");
    expect(isAiConfigured()).toBe(true);
  });
});
