import { afterEach, describe, expect, it } from "vitest";

import { DEMO_LOCAL_NOTICE, demoSuccessMessage, getAppMode, getContactUrl, parseDemoOperations } from "./app-mode";

const originalMode = process.env.NEXT_PUBLIC_APP_MODE;
const originalContact = process.env.NEXT_PUBLIC_CONTACT_URL;

afterEach(() => {
  if (originalMode === undefined) delete process.env.NEXT_PUBLIC_APP_MODE;
  else process.env.NEXT_PUBLIC_APP_MODE = originalMode;
  if (originalContact === undefined) delete process.env.NEXT_PUBLIC_CONTACT_URL;
  else process.env.NEXT_PUBLIC_CONTACT_URL = originalContact;
});

describe("app mode", () => {
  it("未設定や不明値は安全側のdemoになる", () => {
    delete process.env.NEXT_PUBLIC_APP_MODE;
    expect(getAppMode()).toBe("demo");
    process.env.NEXT_PUBLIC_APP_MODE = "preview";
    expect(getAppMode()).toBe("demo");
  });

  it("productionの明示指定時だけClient Production Modeになる", () => {
    process.env.NEXT_PUBLIC_APP_MODE = "production";
    expect(getAppMode()).toBe("production");
  });

  it("問い合わせCTAにはhttp(s) URLだけを許可する", () => {
    process.env.NEXT_PUBLIC_CONTACT_URL = "javascript:alert(1)";
    expect(getContactUrl()).toBeNull();
    process.env.NEXT_PUBLIC_CONTACT_URL = "https://example.com/contact";
    expect(getContactUrl()).toBe("https://example.com/contact");
  });

  it("デモの成功メッセージにはブラウザ内だけの保持であることを明記する", () => {
    delete process.env.NEXT_PUBLIC_APP_MODE;
    expect(demoSuccessMessage("入庫しました。")).toBe(`入庫しました。 ${DEMO_LOCAL_NOTICE}`);
    process.env.NEXT_PUBLIC_APP_MODE = "production";
    expect(demoSuccessMessage("入庫しました。")).toBe("入庫しました。");
  });

  it("ブラウザ保存値が壊れていても安全に空履歴として扱う", () => {
    expect(parseDemoOperations("not json")).toEqual([]);
    expect(parseDemoOperations(JSON.stringify({ at: "x" }))).toEqual([]);
    expect(parseDemoOperations(JSON.stringify([{ at: "2026-09-13T00:00:00.000Z", message: "ok" }, { at: 1, message: "ng" }]))).toEqual([
      { at: "2026-09-13T00:00:00.000Z", message: "ok" },
    ]);
    const many = Array.from({ length: 30 }, (_, index) => ({ at: String(index), message: String(index) }));
    expect(parseDemoOperations(JSON.stringify(many))).toHaveLength(20);
  });
});
