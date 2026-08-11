// Tests — mêmes scénarios et mêmes chiffres que le dossier de vérification v19.
// Lancer : node test.js
import { backupSummary } from "./backup.js";
import { saleFromCost, projectMargin } from "./margin.js";

let passed = 0;
let failed = 0;

function check(label, actual, expected, tolerance = 0.005) {
  const ok = Math.abs(actual - expected) < tolerance;
  console.log(`${ok ? "PASS" : "FAIL"} — ${label} (attendu ${expected}, obtenu ${actual})`);
  if (ok) passed++; else failed++;
}

function mkBudget(hours = {}) {
  const rows = (id) => [{ hours: hours[id] || 0 }];
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

console.log("--- BKP-01 / BKP-02 : Fab 134h + Prog 44h + Assemblage 338h, backup 10%, 112$/h ---");
{
  const budget = mkBudget({ fabrication: 134, programmation: 44, assemblage: 338, conception: 999, installation: 999 });
  const result = backupSummary(budget, 112);
  check("BKP-01 heures (Conception=999h et Installation=999h injectées, doivent être ignorées)", result.hours, 51.60);
  check("BKP-02 coût backup avant marge", result.baseCost, 5779.20);
}

console.log("\n--- BKP-03 : gel du taux historique ---");
{
  const oldBudget = mkBudget({ fabrication: 100 });
  backupSummary(oldBudget, 112); // premier calcul : gèle le taux à 112$/h
  const afterModelRateChange = backupSummary(oldBudget, 120); // le taux modèle change à 120$/h
  check("BKP-03 ancien budgétaire reste gelé à 112$/h", afterModelRateChange.rate, 112);

  const newBudget = mkBudget({ fabrication: 100 });
  const forNewBudget = backupSummary(newBudget, 120); // créé après le changement
  check("BKP-03 nouveau budgétaire prend le nouveau taux 120$/h", forNewBudget.rate, 120);
}

console.log("\n--- Back-up : prix de vente selon la complexité (chiffres vérifiés dans la v19 réelle) ---");
{
  const budget = mkBudget({ fabrication: 134, programmation: 44, assemblage: 338, conception: 999, installation: 999 });
  const result = backupSummary(budget, 112); // complexité par défaut = 0
  check("Back-up — marge à complexité 0", result.margin, 20);
  check("Back-up — prix de vente à complexité 0", result.sale, 7224.00);
}
{
  const budget = mkBudget({ fabrication: 100 });
  budget.backupHoursComplexity = 5;
  const result = backupSummary(budget, 112);
  check("Back-up — marge à complexité 5", result.margin, 30);
}

console.log("\n--- BUD-04 : prix de vente ---");
check("BUD-04 (10 000$ avant marge, marge 30%)", saleFromCost(10000, 30), 14285.71);

console.log("\n--- MARG-01 / MARG-02 : marge réelle ---");
{
  const m1 = projectMargin(22439.08, 1415, 300);
  check("MARG-01 marge $", m1.grossMargin, 20724.08);
  check("MARG-01 marge %", m1.grossMarginPct, 92.36, 0.01);

  const m2 = projectMargin(0, 0, 0);
  check("MARG-02 prix vendu = 0, pas de NaN/Infinity", m2.grossMarginPct, 0);
}

console.log(`\n${passed} réussi(s), ${failed} échoué(s)`);
process.exit(failed > 0 ? 1 : 0);
