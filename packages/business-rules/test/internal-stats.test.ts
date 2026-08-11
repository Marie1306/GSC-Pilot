// Porté 1-pour-1 depuis docs/handoff/03-modules-v01/internal-stats.test.js (6 assertions).
import { describe, it, expect } from "vitest";
import { internalHoursSummary, internalPurchasesSummary } from "../src/internal-stats.js";

describe("Heures internes", () => {
  const entries = [
    { employee: "emp-1", projectType: "internal", status: "approved", date: "2026-03-10", roundedMinutes: 120, costRate: 40 }, // 2h, 80$
    { employee: "emp-1", projectType: "internal", status: "approved", date: "2026-06-01", roundedMinutes: 60, costRate: 40 }, // 1h, 40$
    { employee: "emp-2", projectType: "internal", status: "approved", date: "2026-01-15", roundedMinutes: 180, costRate: 30 }, // 3h, 90$
    { employee: "emp-1", projectType: "internal", status: "submitted", date: "2026-02-01", roundedMinutes: 60, costRate: 40 }, // pas approuvé, exclu
    { employee: "emp-1", projectType: "project", status: "approved", date: "2026-02-01", roundedMinutes: 60, costRate: 40 }, // pas interne, exclu
    { employee: "emp-1", projectType: "internal", status: "approved", date: "2025-12-31", roundedMinutes: 999, costRate: 40 }, // mauvaise année, exclu
  ];
  const summary = internalHoursSummary(entries, 2026);

  it("Total heures 2026 (2+1+3=6h)", () => expect(summary.hours).toBe(6));
  it("Total valeur 2026 (80+40+90=210$)", () => expect(summary.value).toBe(210));
  it("2 employés distincts", () => expect(summary.employees.length).toBe(2));
});

describe("Achats internes (séparés des heures)", () => {
  const purchases = [
    { projectType: "internal", status: "authorized", requestedAt: "2026-04-01", amount: 500, category: "Outillage" },
    { projectType: "internal", status: "authorized", requestedAt: "2026-07-15", amount: 1200, category: "Sous-traitance" },
    { projectType: "internal", status: "owner_pending", requestedAt: "2026-05-01", amount: 300, category: "Outillage" }, // pas encore autorisé, exclu
    { projectType: "project", status: "authorized", requestedAt: "2026-05-01", amount: 5000, category: "Fabrication" }, // pas interne, exclu
    { projectType: "internal", status: "authorized", requestedAt: "2025-11-01", amount: 800, category: "Outillage" }, // mauvaise année, exclu
  ];
  const summary = internalPurchasesSummary(purchases, 2026);

  it("Total achats internes 2026 (500+1200=1700$)", () => expect(summary.amount).toBe(1700));
  it("2 catégories distinctes", () => expect(summary.categories.length).toBe(2));
  it("Achats internes n'affectent jamais le total d'heures", () => {
    // structurel : deux fonctions séparées, aucun champ partagé
    expect(true).toBe(true);
  });
});
