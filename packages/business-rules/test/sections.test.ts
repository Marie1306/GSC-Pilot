import { describe, it, expect } from "vitest";
import { sectionSummary, budgetTotals, projectBackupSummary } from "../src/sections.js";

describe("sectionSummary — heures et coût avant marge d'une section", () => {
  it("additionne les heures et le coût de toutes les lignes de la section", () => {
    const result = sectionSummary({
      category: "fabrication",
      complexity: 0,
      rows: [
        { hourlyRate: 112, hours: 40 },
        { hourlyRate: 112, hours: 20 },
      ],
    });
    expect(result.hours).toBe(60);
    expect(result.baseCost).toBe(6720); // 60h × 112$
  });

  it("chaque ligne garde son propre taux gelé (fabrication peut avoir des sous-tâches à des taux différents)", () => {
    const result = sectionSummary({
      category: "fabrication",
      rows: [
        { hourlyRate: 112, hours: 10 },
        { hourlyRate: 130, hours: 10 },
      ],
    });
    expect(result.baseCost).toBe(2420); // 10×112 + 10×130
  });

  it("section sans lignes = 0h, 0$, sans erreur", () => {
    const result = sectionSummary({ category: "conception", rows: [] });
    expect(result).toMatchObject({ hours: 0, baseCost: 0, sale: 0 });
  });

  it("un achat direct par ligne s'ajoute au coût, en plus des heures × taux (vérifié dans le prototype v19, 12 août 2026)", () => {
    const result = sectionSummary({
      category: "programmation",
      complexity: 0,
      rows: [{ hourlyRate: 117, hours: 10, purchaseAmount: 500 }],
    });
    expect(result.baseCost).toBe(1670); // 10×117 + 500
  });

  it("une ligne purement achat (0h) contribue quand même au coût — ex. Stock, Déplacements", () => {
    const result = sectionSummary({ category: "stock", rows: [{ hourlyRate: 0, hours: 0, purchaseAmount: 1200 }] });
    expect(result.hours).toBe(0);
    expect(result.baseCost).toBe(1200);
  });
});

describe("sectionSummary — complexité PAR SECTION affecte le prix de vente (confirmé le 11 août 2026)", () => {
  it("complexité 0 → marge 20 % (même échelle que margin.ts, non modifiée)", () => {
    const result = sectionSummary({ category: "conception", complexity: 0, rows: [{ hourlyRate: 117, hours: 10 }] });
    expect(result.margin).toBe(20);
    expect(result.sale).toBeCloseTo(1170 / 0.8, 2);
  });

  it("complexité 5 → marge 30 %, différente d'une autre section à complexité 0 sur le même budgétaire", () => {
    const highComplexity = sectionSummary({ category: "installation", complexity: 5, rows: [{ hourlyRate: 112, hours: 10 }] });
    const lowComplexity = sectionSummary({ category: "assemblage", complexity: 0, rows: [{ hourlyRate: 112, hours: 10 }] });
    expect(highComplexity.margin).toBe(30);
    expect(lowComplexity.margin).toBe(20);
    expect(highComplexity.sale).not.toBe(lowComplexity.sale);
  });
});

describe("projectBackupSummary — réserve projet distincte du back-up d'heures (confirmé le 12 août 2026)", () => {
  it("montant saisi à la main, la complexité détermine seulement la marge", () => {
    const result = projectBackupSummary(12500, 5);
    expect(result.baseCost).toBe(12500);
    expect(result.margin).toBe(30); // complexité 5 → 30 % (même échelle que margin.ts)
    expect(result.sale).toBeCloseTo(12500 / 0.7, 2);
  });

  it("montant à 0 → tout à 0, sans erreur", () => {
    expect(projectBackupSummary(0, 0)).toMatchObject({ baseCost: 0, sale: 0, margin: 20 });
  });
});

describe("budgetTotals — additionne les sections, le back-up d'heures ET le back-up projet", () => {
  it("un seul total, cohérent avec la somme manuelle", () => {
    const sections = [
      sectionSummary({ category: "conception", complexity: 0, rows: [{ hourlyRate: 117, hours: 10 }] }),
      sectionSummary({ category: "fabrication", complexity: 0, rows: [{ hourlyRate: 112, hours: 20 }] }),
    ];
    const hoursBackup = { hours: 2, baseCost: 224, sale: 280 };
    const projectBackup = projectBackupSummary(1000, 5);
    const totals = budgetTotals(sections, hoursBackup, projectBackup);
    expect(totals.totalHours).toBe(sections[0].hours + sections[1].hours + hoursBackup.hours);
    expect(totals.totalBaseCost).toBeCloseTo(sections[0].baseCost + sections[1].baseCost + hoursBackup.baseCost + projectBackup.baseCost, 2);
    expect(totals.totalSale).toBeCloseTo(sections[0].sale + sections[1].sale + hoursBackup.sale + projectBackup.sale, 2);
  });
});
