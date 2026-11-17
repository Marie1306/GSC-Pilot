import { describe, it, expect } from "vitest";
import { externalSaleLineAmount, externalSaleTotals, externalSaleInvoiceLines } from "../src/external-sales.js";

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

describe("externalSaleInvoiceLines", () => {
  it("même scénario que le total confirmé ci-dessus — la somme des lignes retombe sur le total gelé (à l'arrondi par ligne près)", () => {
    const lines = [
      { description: "Pièce A", qty: 2, unitCost: 50 },
      { description: "Pièce B", qty: 1, unitCost: 200 },
      { description: "Pièce C", qty: 5, unitCost: 20 },
    ];
    const invoiceLines = externalSaleInvoiceLines(lines, 50, 75, 25);
    // 3 lignes de pièces + 1 ligne Transport (son propre poste, jamais fusionné)
    expect(invoiceLines).toHaveLength(4);
    expect(invoiceLines[3]!.description).toBe("Transport");
    // Identité affichée toujours exacte : prix unitaire × qté = montant.
    for (const line of invoiceLines) {
      expect(line.amount).toBeCloseTo(line.unitPrice * line.quantity, 2);
    }
    const sum = invoiceLines.reduce((total, line) => total + line.amount, 0);
    expect(sum).toBeCloseTo(700, 1); // externalSaleTotals ci-dessus : 700,00 $ — écart de quelques cents toléré
  });

  it("frais administratifs répartis par UNITÉ vendue, pas par ligne — une ligne à qté 3 reçoit 3 parts", () => {
    // 1 pièce à qté 1, 1 pièce à qté 3 → 4 unités au total, 20 $ de frais à 20 % de marge.
    const lines = [
      { description: "Pièce unique", qty: 1, unitCost: 100 },
      { description: "Pièce multiple", qty: 3, unitCost: 100 },
    ];
    const invoiceLines = externalSaleInvoiceLines(lines, 0, 20, 20);
    // saleFromCost(20, 20) = 25 $ de frais majorés, répartis sur 4 unités = 6,25 $/unité.
    // saleFromCost(100, 20) = 125 $ par pièce avant frais.
    expect(invoiceLines[0]!.unitPrice).toBeCloseTo(125 + 6.25, 2);
    expect(invoiceLines[1]!.unitPrice).toBeCloseTo(125 + 6.25, 2);
    // La ligne à qté 3 porte bien 3 fois sa part, pas 1 fois (jamais par ligne).
    expect(invoiceLines[1]!.amount).toBeCloseTo(invoiceLines[1]!.unitPrice * 3, 2);
  });

  it("sans transport ni frais administratifs — pas de ligne Transport, lignes de pièces inchangées", () => {
    const invoiceLines = externalSaleInvoiceLines([{ description: "Pièce", qty: 1, unitCost: 80 }], 0, 0, 20);
    expect(invoiceLines).toHaveLength(1);
    expect(invoiceLines[0]!.amount).toBeCloseTo(100, 2); // 80 / 0.8
  });

  it("aucune pièce vendue (limite) — jamais de division invalide sur le prorata des frais", () => {
    expect(() => externalSaleInvoiceLines([], 20, 10, 20)).not.toThrow();
  });
});
