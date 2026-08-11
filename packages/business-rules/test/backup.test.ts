// Porté 1-pour-1 depuis docs/handoff/03-modules-v01/test.js (checks BKP-01..03 + vente back-up).
// Mêmes scénarios et mêmes chiffres que le dossier de vérification v19.
import { describe, it, expect } from "vitest";
import { backupSummary, type BudgetLike } from "../src/backup.js";

function mkBudget(hours: Record<string, number> = {}): BudgetLike {
  const rows = (id: string) => [{ hours: hours[id] || 0 }];
  return {
    backupHoursPct: 10,
    sections: [
      { id: "fabrication", rows: rows("fabrication") },
      { id: "programmation", rows: rows("programmation") },
      { id: "assemblage", rows: rows("assemblage") },
      { id: "conception", rows: rows("conception") },
      { id: "installation", rows: rows("installation") },
    ],
  };
}

describe("BKP-01 / BKP-02 : Fab 134h + Prog 44h + Assemblage 338h, backup 10%, 112$/h", () => {
  const budget = mkBudget({ fabrication: 134, programmation: 44, assemblage: 338, conception: 999, installation: 999 });
  const result = backupSummary(budget, 112);

  it("BKP-01 heures (Conception=999h et Installation=999h injectées, doivent être ignorées)", () => {
    expect(result.hours).toBeCloseTo(51.6, 2);
  });
  it("BKP-02 coût backup avant marge", () => {
    expect(result.baseCost).toBeCloseTo(5779.2, 2);
  });
});

describe("BKP-03 : gel du taux historique", () => {
  it("ancien budgétaire reste gelé à 112$/h", () => {
    const oldBudget = mkBudget({ fabrication: 100 });
    backupSummary(oldBudget, 112); // premier calcul : gèle le taux à 112$/h
    const afterModelRateChange = backupSummary(oldBudget, 120); // le taux modèle change à 120$/h
    expect(afterModelRateChange.rate).toBe(112);
  });
  it("nouveau budgétaire prend le nouveau taux 120$/h", () => {
    const newBudget = mkBudget({ fabrication: 100 });
    const forNewBudget = backupSummary(newBudget, 120); // créé après le changement
    expect(forNewBudget.rate).toBe(120);
  });
});

describe("Back-up : prix de vente selon la complexité (chiffres vérifiés dans la v19 réelle)", () => {
  it("marge à complexité 0", () => {
    const budget = mkBudget({ fabrication: 134, programmation: 44, assemblage: 338, conception: 999, installation: 999 });
    const result = backupSummary(budget, 112); // complexité par défaut = 0
    expect(result.margin).toBe(20);
  });
  it("prix de vente à complexité 0", () => {
    const budget = mkBudget({ fabrication: 134, programmation: 44, assemblage: 338, conception: 999, installation: 999 });
    const result = backupSummary(budget, 112);
    expect(result.sale).toBeCloseTo(7224.0, 2);
  });
  it("marge à complexité 5", () => {
    const budget = mkBudget({ fabrication: 100 });
    budget.backupHoursComplexity = 5;
    const result = backupSummary(budget, 112);
    expect(result.margin).toBe(30);
  });
});
