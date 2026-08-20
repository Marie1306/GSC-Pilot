import { describe, it, expect } from "vitest";
import { rateForType, serviceCallLaborTotals, serviceCallExpenseTotal } from "../src/service-calls.js";

const senior = { regularRate: 128.12, overtimeRate: 153.74, extraRate: 189.63 };

describe("Tarif facturable par type de temps", () => {
  it("régulier", () => expect(rateForType(senior, "regular")).toBe(128.12));
  it("temps supplémentaire", () => expect(rateForType(senior, "overtime")).toBe(153.74));
  it("extra", () => expect(rateForType(senior, "extra")).toBe(189.63));
});

describe("Totaux main-d'œuvre d'un appel de service", () => {
  const techLevelsById = { tl1: senior };
  const entries = [
    { status: "approved", roundedMinutes: 120, costRate: 28, techLevelId: "tl1", rateType: "regular" }, // 2h
    { status: "approved", roundedMinutes: 60, costRate: 28, techLevelId: "tl1", rateType: "overtime" }, // 1h
    { status: "submitted", roundedMinutes: 999, costRate: 999, techLevelId: "tl1", rateType: "regular" }, // exclu, pas approuvé
  ];
  const totals = serviceCallLaborTotals(entries, techLevelsById);

  it("3h approuvées (le punch non approuvé est exclu)", () => expect(totals.hours).toBe(3));
  it("coût réel = 3h × 28$ (coût employé, pas le tarif facturable)", () => expect(totals.cost).toBe(84));
  it("prix de vente = 2h régulier + 1h temps sup. (128,12 + 153,74)", () => expect(totals.sale).toBeCloseTo(409.98, 2));
  it("tableau vide sans punchs", () => expect(serviceCallLaborTotals([], {}).hours).toBe(0));
});

describe("Tarif spécifique par tâche (20 août 2026)", () => {
  const techLevelsById = { tl1: senior };

  it("remplace le taux de la classe quand renseigné", () => {
    const entries = [{ status: "approved", roundedMinutes: 60, costRate: 28, techLevelId: "tl1", rateType: "regular", specificRate: 112.75 }];
    expect(serviceCallLaborTotals(entries, techLevelsById).sale).toBe(112.75);
  });

  it("coût réel reste basé sur costRate, jamais affecté par le tarif spécifique", () => {
    const entries = [{ status: "approved", roundedMinutes: 60, costRate: 28, techLevelId: "tl1", rateType: "regular", specificRate: 112.75 }];
    expect(serviceCallLaborTotals(entries, techLevelsById).cost).toBe(28);
  });

  it("retombe sur le taux de la classe quand nul", () => {
    const entries = [{ status: "approved", roundedMinutes: 60, costRate: 28, techLevelId: "tl1", rateType: "regular", specificRate: null }];
    expect(serviceCallLaborTotals(entries, techLevelsById).sale).toBe(128.12);
  });
});

describe("Frais de déplacement et repas", () => {
  const rates = { mileageRate: 0.68, breakfastRate: 15, lunchRate: 20, dinnerRate: 25 };
  it("kilométrage seul", () => expect(serviceCallExpenseTotal(100, [], rates)).toBe(68));
  it("repas réclamés (taux fixe par type, pas par quantité)", () =>
    expect(serviceCallExpenseTotal(0, ["lunch", "dinner"], rates)).toBe(45));
  it("kilométrage + repas combinés", () => expect(serviceCallExpenseTotal(50, ["breakfast"], rates)).toBe(49));
  it("aucun frais", () => expect(serviceCallExpenseTotal(null, undefined, rates)).toBe(0));
});
