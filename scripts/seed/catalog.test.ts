import { describe, expect, it } from "vitest";

import { MAKERS, SEED_LOCATIONS, generateProducts, generateSuppliers } from "./catalog";
import { Rng } from "./random";

describe("全国向けデモデータ", () => {
  it("4拠点を異なる都道府県に分散する", () => {
    expect(SEED_LOCATIONS).toHaveLength(4);
    expect(new Set(SEED_LOCATIONS.map((location) => location.prefecture)).size).toBe(4);
    expect(SEED_LOCATIONS.map((location) => location.code)).toEqual(["TYO", "OSA", "FUK", "SPK"]);
  });

  it("40仕入先を全国20都道府県に分散し、固定seedで再現できる", () => {
    const first = generateSuppliers(new Rng(20260913), 40);
    const second = generateSuppliers(new Rng(20260913), 40);

    expect(first).toEqual(second);
    expect(first).toHaveLength(40);
    expect(new Set(first.map((supplier) => supplier.prefecture)).size).toBe(20);
    expect(first.filter((supplier) => supplier.prefecture === "鹿児島県")).toHaveLength(2);
  });

  it("公開デモ用に固定seedで1,000 SKUを再現できる", () => {
    const first = generateProducts(new Rng(20260913), 1000);
    const second = generateProducts(new Rng(20260913), 1000);

    expect(first).toEqual(second);
    expect(first).toHaveLength(1000);
    expect(new Set(first.map((product) => product.sku)).size).toBe(1000);
    expect(new Set(first.map((product) => product.janCode)).size).toBe(1000);
  });

  it("商品メーカー名に特定地域へ偏った旧名称を残さない", () => {
    const names = Object.values(MAKERS).flatMap((maker) => [maker.name, ...maker.brands.map(([name]) => name)]).join(" ");
    expect(names).not.toMatch(/薩南|錦湾|南の穂/);
  });
});
