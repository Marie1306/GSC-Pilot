import { describe, it, expect } from "vitest";
import { computeDetailedSummary, type BudgetDetail, type BudgetSectionData } from "./api.js";

/**
 * Garde-fou anti-régression (13 août 2026) — computeDetailedSummary a déjà
 * eu deux problèmes réels à sa construction (mauvais import de type, puis
 * Sous-traitance comptée deux fois dans « Achats détaillés » alors qu'elle
 * a sa propre carte, corrigé le 13 août 2026 sur signalement direct de
 * l'utilisatrice). Ce test ne touche aucune base de données — sections/
 * totals sont de simples objets.
 */
function section(category: string, kind: "labor" | "purchase", hours: number, baseCost: number): BudgetSectionData {
  return { id: category, category, kind, hours, baseCost, sale: baseCost, complexity: 0, margin: 20, rows: [] };
}

function budget(sections: BudgetSectionData[], totals: { totalHours: number; totalBaseCost: number; totalSale: number }): BudgetDetail {
  return {
    id: "b1",
    displayId: "BG-2026-0001",
    status: "draft",
    contactName: "Test",
    company: null,
    createdByName: "Test Direction",
    createdAt: "2026-08-13T00:00:00.000Z",
    totalSale: totals.totalSale,
    backupHourlyRate: 112,
    backupHoursPct: 10,
    backupHoursComplexity: 0,
    projectBackupAmount: 0,
    projectBackupComplexity: 0,
    poNumber: null,
    quantity: 1,
    validUntil: null,
    summary: null,
    riskSummary: null,
    clientRequestId: null,
    clientRequestDisplayId: null,
    requestType: null,
    email: null,
    phone: null,
    requestCreatedAt: null,
    requestSummary: null,
    sentAt: null,
    contractWonAt: null,
    sections,
    backup: { hours: 0, baseCost: 0, sale: 0, pct: 10, complexity: 0, margin: 20, rate: 112 },
    projectBackup: { baseCost: 0, sale: 0, complexity: 0, margin: 20 },
    totals,
  };
}

describe("computeDetailedSummary", () => {
  const sections = [
    section("conception", "labor", 10, 1000),
    section("fabrication", "labor", 5, 500),
    section("assemblyTest", "labor", 3, 300),
    section("panelProgramming", "labor", 4, 400),
    section("stockFabrication", "purchase", 0, 200),
    section("subcontracting", "purchase", 0, 600),
    section("installationLabor", "labor", 2, 200),
    section("installationStock", "purchase", 0, 50),
    section("installationExpenses", "purchase", 0, 50),
  ];
  const totals = { totalHours: 24, totalBaseCost: 3300, totalSale: 4000 };
  const summary = computeDetailedSummary(budget(sections, totals));

  it("achatsDetailles exclut Sous-traitance (déjà sa propre carte) ET le groupe Installation", () => {
    // Seule stockFabrication (200 $) qualifie : ni Sous-traitance (600 $), ni Installation (50+50 $).
    expect(summary.achatsDetailles).toBe(200);
  });

  it("subcontracting reste affichée dans sa propre carte", () => {
    expect(summary.subcontracting.cost).toBe(600);
  });

  it("coutPlanifie additionne toutes les catégories, jamais les back-up", () => {
    expect(summary.coutPlanifie).toBe(1000 + 500 + 300 + 400 + 200 + 600 + 200 + 50 + 50);
  });

  it("fabricationAssemblage combine Fabrication et Assemblage & Test", () => {
    expect(summary.fabricationAssemblage).toEqual({ hours: 8, cost: 800 });
  });

  it("installationStockExpenses combine Installation Stock et Frais divers", () => {
    expect(summary.installationStockExpenses).toEqual({ hours: 0, cost: 100 });
  });

  it("margeResultante dérive de totals (catégories + back-up), pas des sections seules", () => {
    expect(summary.margeResultante).toBe(Math.round(((4000 - 3300) / 4000) * 1000) / 10);
  });
});
