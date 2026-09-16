import { describe, it, expect } from "vitest";
import { seaoBordereauLineSalePrice, seaoBordereauTotal } from "../src/seao.js";

describe("seaoBordereauLineSalePrice", () => {
  it("coût / (1 - marge) — même formule que saleFromCost partout ailleurs", () => {
    expect(seaoBordereauLineSalePrice(80, 20)).toBeCloseTo(100, 2); // 80 / 0.8
  });
  it("marge 0 % — prix de vente = coût", () => {
    expect(seaoBordereauLineSalePrice(100, 0)).toBeCloseTo(100, 2);
  });
  it("coût nul — jamais de division invalide", () => {
    expect(seaoBordereauLineSalePrice(0, 20)).toBe(0);
  });
});

describe("seaoBordereauTotal", () => {
  it("somme des prix de vente déjà calculés, arrondie à 2 décimales", () => {
    const total = seaoBordereauTotal([100, 250.5, 33.33]);
    expect(total).toBeCloseTo(383.83, 2);
  });
  it("aucune ligne — 0, jamais NaN", () => {
    expect(seaoBordereauTotal([])).toBe(0);
  });
});
