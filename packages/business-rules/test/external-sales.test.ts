import { describe, it, expect } from "vitest";
import { externalSaleLineAmount, externalSaleTotals } from "../src/external-sales.js";

describe("externalSaleLineAmount", () => {
  it("qty × coût unitaire, arrondi à 2 décimales", () => {
    expect(externalSaleLineAmount(3, 12.995)).toBeCloseTo(38.99, 2);
  });
  it("qty ou coût manquant → 0, jamais NaN", () => {
    expect(externalSaleLineAmount(0, 0)).toBe(0);
  });
});

describe("externalSaleTotals", () => {
  it("3 lignes + frais + marge 25 % — exemple confirmé avec l'utilisatrice", () => {
    const lineAmounts = [
      externalSaleLineAmount(2, 50), // 100
      externalSaleLineAmount(1, 200), // 200
      externalSaleLineAmount(5, 20), // 100
    ];
    const totals = externalSaleTotals(lineAmounts, 50, 75, 25);
    expect(totals.partsBaseCost).toBeCloseTo(400, 2);
    expect(totals.baseCostBeforeMargin).toBeCloseTo(525, 2); // 400 + 50 + 75
    expect(totals.salePrice).toBeCloseTo(700, 2); // 525 / (1 - 0.25)
  });

  it("marge par défaut 20 % (pré-remplie, modifiable)", () => {
    const totals = externalSaleTotals([externalSaleLineAmount(1, 80)], 0, 0, 20);
    expect(totals.salePrice).toBeCloseTo(100, 2); // 80 / 0.8
  });

  it("frais de transport/administratifs sans lignes de pièces (limite) — jamais de division invalide", () => {
    const totals = externalSaleTotals([], 0, 0, 20);
    expect(totals.partsBaseCost).toBe(0);
    expect(totals.salePrice).toBe(0);
  });

  it("aucune marge (0 %) — prix de vente = coût de base", () => {
    const totals = externalSaleTotals([externalSaleLineAmount(1, 100)], 0, 0, 0);
    expect(totals.salePrice).toBeCloseTo(100, 2);
  });
});
