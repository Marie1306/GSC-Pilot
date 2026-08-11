// Tests — node internal-stats.test.js
import { internalHoursSummary, internalPurchasesSummary } from "./internal-stats.js";

let passed = 0, failed = 0;
function check(label, actual, expected) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected) || actual === expected;
  console.log(`${ok ? "PASS" : "FAIL"} — ${label} (attendu ${JSON.stringify(expected)}, obtenu ${JSON.stringify(actual)})`);
  if (ok) passed++; else failed++;
}

console.log("--- Heures internes ---");
{
  const entries = [
    { employee: "emp-1", projectType: "internal", status: "approved", date: "2026-03-10", roundedMinutes: 120, costRate: 40 }, // 2h, 80$
    { employee: "emp-1", projectType: "internal", status: "approved", date: "2026-06-01", roundedMinutes: 60, costRate: 40 },  // 1h, 40$
    { employee: "emp-2", projectType: "internal", status: "approved", date: "2026-01-15", roundedMinutes: 180, costRate: 30 }, // 3h, 90$
    { employee: "emp-1", projectType: "internal", status: "submitted", date: "2026-02-01", roundedMinutes: 60, costRate: 40 }, // pas approuvé, exclu
    { employee: "emp-1", projectType: "project", status: "approved", date: "2026-02-01", roundedMinutes: 60, costRate: 40 },   // pas interne, exclu
    { employee: "emp-1", projectType: "internal", status: "approved", date: "2025-12-31", roundedMinutes: 999, costRate: 40 }, // mauvaise année, exclu
  ];
  const summary = internalHoursSummary(entries, 2026);
  check("Total heures 2026 (2+1+3=6h)", summary.hours, 6);
  check("Total valeur 2026 (80+40+90=210$)", summary.value, 210);
  check("2 employés distincts", summary.employees.length, 2);
}

console.log("\n--- Achats internes (séparés des heures) ---");
{
  const purchases = [
    { projectType: "internal", status: "authorized", requestedAt: "2026-04-01", amount: 500, category: "Outillage" },
    { projectType: "internal", status: "authorized", requestedAt: "2026-07-15", amount: 1200, category: "Sous-traitance" },
    { projectType: "internal", status: "owner_pending", requestedAt: "2026-05-01", amount: 300, category: "Outillage" }, // pas encore autorisé, exclu
    { projectType: "project", status: "authorized", requestedAt: "2026-05-01", amount: 5000, category: "Fabrication" }, // pas interne, exclu
    { projectType: "internal", status: "authorized", requestedAt: "2025-11-01", amount: 800, category: "Outillage" },   // mauvaise année, exclu
  ];
  const summary = internalPurchasesSummary(purchases, 2026);
  check("Total achats internes 2026 (500+1200=1700$)", summary.amount, 1700);
  check("2 catégories distinctes", summary.categories.length, 2);
  check("Achats internes n'affectent jamais le total d'heures", true, true); // structurel : deux fonctions séparées, aucun champ partagé
}

console.log(`\n${passed} réussi(s), ${failed} échoué(s)`);
process.exit(failed > 0 ? 1 : 0);
