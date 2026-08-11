import { describe, it, expect } from "vitest";
import { sectionSummary, budgetTotals } from "../src/sections.js";

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

describe("budgetTotals — additionne les 5 sections ET le back-up", () => {
  it("un seul total, cohérent avec la somme manuelle", () => {
    const sections = [
      sectionSummary({ category: "conception", complexity: 0, rows: [{ hourlyRate: 117, hours: 10 }] }),
      sectionSummary({ category: "fabrication", complexity: 0, rows: [{ hourlyRate: 112, hours: 20 }] }),
    ];
    const backup = { hours: 2, baseCost: 224, sale: 280 };
    const totals = budgetTotals(sections, backup);
    expect(totals.totalHours).toBe(sections[0].hours + sections[1].hours + backup.hours);
    expect(totals.totalBaseCost).toBeCloseTo(sections[0].baseCost + sections[1].baseCost + backup.baseCost, 2);
    expect(totals.totalSale).toBeCloseTo(sections[0].sale + sections[1].sale + backup.sale, 2);
  });
});
