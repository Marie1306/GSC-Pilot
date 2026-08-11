import { describe, it, expect } from "vitest";
import { sectionSummary, budgetTotals, projectBackupSummary, effectiveRowHours } from "../src/sections.js";
import { backupSummary } from "../src/backup.js";

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

/**
 * Scénario de bout en bout figé, codifié depuis l'audit du 12 août 2026
 * (section K, validation mathématique) — valeurs distinctes et connues par
 * type de ligne, ligne auto, back-up d'heures RÉEL (backup.ts, pas un
 * chiffre inventé comme le test ci-dessus) et back-up projet. Sert de
 * garde-fou : toute dérive de formule, tout double comptage, toute valeur
 * résiduelle sur une ligne vide fait échouer ce test précisément, sans
 * attendre qu'un futur audit visuel le remarque.
 */
describe("Scénario mathématique déterministe complet (audit du 12 août 2026)", () => {
  it("chaque sous-total, back-up et le grand total correspondent exactement à la valeur attendue à la main", () => {
    // Conception (labor) — 2 lignes saisies + 1 ligne auto (10 %), complexité 5 → marge 30 %.
    const conceptionRows = [
      { id: "r1", hourlyRate: 117, hours: 10 },
      { id: "r2", hourlyRate: 117, hours: 0, autoFromRowId: "r1", autoPct: 10 },
      { id: "r3", hourlyRate: 112, hours: 4 },
    ];
    const conception = sectionSummary({ category: "conception", kind: "labor", complexity: 5, rows: conceptionRows });
    expect(conception.hours).toBe(15); // 10 + (10×10%) + 4
    expect(conception.baseCost).toBe(1735); // 10×117 + 1×117 + 4×112
    expect(conception.margin).toBe(30);
    expect(conception.sale).toBeCloseTo(1735 / 0.7, 2); // saleFromCost = coût ÷ (1 − marge), pas coût × (1 + marge)

    // Stock Fabrication (purchase) — 2 lignes remplies + 1 ligne vierge, complexité 2 → marge 23 %.
    const stockRows = [
      { id: "s1", qty: 3, unitPrice: 25.5 },
      { id: "s2", qty: 1, unitPrice: 899.99 },
      { id: "s3", qty: 0, unitPrice: 0 }, // ligne vierge — doit valoir 0, jamais une valeur résiduelle
    ];
    const stock = sectionSummary({ category: "stockFabrication", kind: "purchase", complexity: 2, rows: stockRows });
    expect(stock.hours).toBe(0);
    expect(stock.baseCost).toBe(976.49);
    expect(stock.margin).toBe(23);

    expect(effectiveRowHours(conceptionRows[1], conceptionRows)).toBe(1); // 10h × 10 %

    // Back-up d'heures RÉEL — sections admissibles (alias fabrication/programmation/assemblage), taux gelé 112$, 10 %, complexité 3 → marge 24 %.
    const backup = backupSummary(
      {
        sections: [
          { id: "fabrication", rows: [{ hours: 20 }, { hours: 10 }] },
          { id: "programmation", rows: [{ hours: 8 }] },
          { id: "assemblage", rows: [{ hours: 12 }] },
        ],
        backupHourlyRate: 112,
        backupHoursPct: 10,
        backupHoursComplexity: 3,
      },
      112,
    );
    expect(backup.hours).toBe(5); // (20+10+8+12) × 10 %
    expect(backup.baseCost).toBe(560); // 5h × 112$
    expect(backup.margin).toBe(24);

    // Back-up projet — montant saisi à la main, complexité distincte 7 → marge 38 %.
    const projectBackup = projectBackupSummary(2500, 7);
    expect(projectBackup.baseCost).toBe(2500);
    expect(projectBackup.margin).toBe(38);

    // Grand total — chaque section et chaque back-up compté EXACTEMENT une fois.
    const totals = budgetTotals([conception, stock], backup, projectBackup);
    expect(totals.totalHours).toBe(20); // 15 + 0 + 5
    expect(totals.totalBaseCost).toBeCloseTo(1735 + 976.49 + 560 + 2500, 2); // 5771.49
    expect(totals.totalSale).toBeCloseTo(conception.sale + stock.sale + backup.sale + projectBackup.sale, 2);
  });
});
