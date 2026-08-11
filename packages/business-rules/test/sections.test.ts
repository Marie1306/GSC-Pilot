import { describe, it, expect } from "vitest";
import { sectionSummary, budgetTotals, projectBackupSummary, effectiveRowHours } from "../src/sections.js";

describe("sectionSummary — section de type 'labor' (heures × taux)", () => {
  it("additionne les heures et le coût de toutes les lignes de la section", () => {
    const result = sectionSummary({
      category: "fabrication",
      kind: "labor",
      complexity: 0,
      rows: [
        { hourlyRate: 112, hours: 40 },
        { hourlyRate: 112, hours: 20 },
      ],
    });
    expect(result.hours).toBe(60);
    expect(result.baseCost).toBe(6720); // 60h × 112$
  });

  it("chaque ligne garde son propre taux gelé (fabrication a des sous-tâches à des taux différents : Plasma 116$, Usinage 113$...)", () => {
    const result = sectionSummary({
      category: "fabrication",
      kind: "labor",
      rows: [
        { hourlyRate: 116, hours: 10 },
        { hourlyRate: 113, hours: 10 },
      ],
    });
    expect(result.baseCost).toBe(2290); // 10×116 + 10×113
  });

  it("section sans lignes = 0h, 0$, sans erreur", () => {
    const result = sectionSummary({ category: "conception", kind: "labor", rows: [] });
    expect(result).toMatchObject({ hours: 0, baseCost: 0, sale: 0 });
  });

  it("kind par défaut = 'labor' si omis (rétrocompatibilité)", () => {
    const result = sectionSummary({ category: "conception", rows: [{ hourlyRate: 117, hours: 10 }] });
    expect(result.baseCost).toBe(1170);
  });
});

describe("sectionSummary — ligne calculée automatiquement (ex. « Conception plus 10 % », vérifié le 12 août 2026)", () => {
  it("heures effectives = heures d'une autre ligne de la même section × autoPct / 100, jamais saisies directement", () => {
    const rows = [
      { id: "conception-dessin", hourlyRate: 117, hours: 40 },
      { id: "conception-plus-10", hourlyRate: 117, hours: 999, autoFromRowId: "conception-dessin", autoPct: 10 },
    ];
    expect(effectiveRowHours(rows[1], rows)).toBe(4); // 40h × 10 %, ignore le 999 stocké
    const result = sectionSummary({ category: "conception", kind: "labor", complexity: 0, rows });
    expect(result.hours).toBe(44); // 40 + 4
    expect(result.baseCost).toBe(44 * 117);
  });

  it("source introuvable → 0h effectives, sans erreur", () => {
    const rows = [{ id: "orphelin", hourlyRate: 117, hours: 5, autoFromRowId: "inexistant", autoPct: 10 }];
    expect(effectiveRowHours(rows[0], rows)).toBe(0);
  });
});

describe("sectionSummary — section de type 'purchase' (quantité × prix unitaire, vérifié le 12 août 2026)", () => {
  it("le coût vient de qty × unitPrice, jamais des heures", () => {
    const result = sectionSummary({
      category: "stockFabrication",
      kind: "purchase",
      complexity: 0,
      rows: [
        { qty: 4, unitPrice: 25 },
        { qty: 2, unitPrice: 100 },
      ],
    });
    expect(result.hours).toBe(0); // une section achat n'a pas d'heures
    expect(result.baseCost).toBe(300); // 4×25 + 2×100
  });

  it("10 lignes vierges (qty=0) = 0$, sans erreur", () => {
    const rows = Array.from({ length: 10 }, () => ({ qty: 0, unitPrice: 0 }));
    const result = sectionSummary({ category: "subcontracting", kind: "purchase", rows });
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
