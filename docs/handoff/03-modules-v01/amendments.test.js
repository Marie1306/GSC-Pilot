// Tests — node amendments.test.js
import { calculateAmendment, applyAmendmentToProject, amendmentTasks, amendmentInvoiceRequest, AMENDMENT_INTERNAL_RATES } from "./amendments.js";

let passed = 0, failed = 0;
function check(label, actual, expected) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  console.log(`${ok ? "PASS" : "FAIL"} — ${label} (attendu ${JSON.stringify(expected)}, obtenu ${JSON.stringify(actual)})`);
  if (ok) passed++; else failed++;
}
function checkNum(label, actual, expected) {
  const ok = actual === expected;
  console.log(`${ok ? "PASS" : "FAIL"} — ${label} (attendu ${expected}, obtenu ${actual})`);
  if (ok) passed++; else failed++;
}

console.log("--- Back-up : mêmes catégories admissibles que le calcul principal (134/44/338, taux figé 112$) ---");
{
  const hours = {
    conception: 999, // exclu
    "fabrication-usinage": 134,
    programmation: 44,
    assemblage: 338,
    installation: 999, // exclu
  };
  const calc = calculateAmendment(hours, { marginPct: 20, backupPct: 10, projectBackupRate: 112, purchases: 0 });
  checkNum("Heures admissibles au back-up = 516h (Conception/Installation exclues même à 999h)", calc.backupEligibleHours, 516);
  checkNum("Back-up = 51,60h", calc.backupHours, 51.6);
  checkNum("Coût du back-up = 51,60 × 112$ = 5 779,20$ (taux unique du projet, pas une moyenne pondérée)", calc.backupCost, 5779.2);
}

console.log("\n--- Fabrication divisée en sous-catégories : coût identique à un seul bloc ---");
{
  const unSeulBloc = calculateAmendment({ fabrication: 100 }, { marginPct: 0, backupPct: 0, projectBackupRate: 112 });
  const diviseEnCinq = calculateAmendment(
    { "fabrication-plasma": 20, "fabrication-pliage": 20, "fabrication-usinage": 20, "fabrication-soudage": 20, "fabrication-peinture": 20 },
    { marginPct: 0, backupPct: 0, projectBackupRate: 112 }
  );
  checkNum("Coût identique peu importe la répartition (5 × 20h = 100h au même taux)", diviseEnCinq.laborCost, unSeulBloc.laborCost);
  checkNum("Heures totales identiques", diviseEnCinq.laborHours, unSeulBloc.laborHours);
}

console.log("\n--- Marge et prix de vente ---");
{
  const calc = calculateAmendment({ conception: 10 }, { marginPct: 20, backupPct: 0, projectBackupRate: 112, purchases: 0 });
  // 10h x 117$/h = 1170$ coût; prix vente = 1170 / 0.8 = 1462.50$
  checkNum("Coût main-d'œuvre (10h conception à 117$/h)", calc.laborCost, 1170);
  checkNum("Prix de vente (marge 20%)", calc.sale, 1462.5);
}

console.log("\n--- Application au projet — additionne, ne remplace jamais ---");
{
  const project = {
    laborHours: 50, laborCost: 5000, backupHours: 5, backupHoursCost: 560, plannedPurchases: 100, sold: 10000,
    invoicePlan: [{ label: "Signature", pct: 25, amount: 2500 }, { label: "Livraison", pct: 75, amount: 7500 }],
  };
  const calc = calculateAmendment({ conception: 10 }, { marginPct: 20, backupPct: 0, projectBackupRate: 112, purchases: 50 });
  applyAmendmentToProject(project, calc);
  checkNum("Heures additionnées, pas remplacées", project.laborHours, 60);
  checkNum("Coût additionné", project.laborCost, 6170);
  checkNum("Achats additionnés", project.plannedPurchases, 150);
  checkNum("Prix vendu total additionné (10 000 + 1 525 [1220$ coût / 0,8])", project.sold, 11525);
  checkNum("Plan de facturation recalculé sur le nouveau total (25% de 11 525$)", project.invoicePlan[0].amount, 2881.25);
}

console.log("\n--- Génération des tâches détaillées ---");
{
  const tasks = amendmentTasks("AV-042", {
    "fabrication-plasma": 5, "fabrication-usinage": 8, programmation: 12, assemblage: 6,
  });
  checkNum("4 tâches générées (2 sous-catégories fabrication + 2 catégories simples)", tasks.length, 4);
  const plasma = tasks.find(t => t.subcategory === "fabrication-plasma");
  check("Sous-catégorie conservée pour le détail (vue projet / post-mortem)", plasma.subcategory, "fabrication-plasma");
  check("Catégorie Gantt = fabrication (s'agrège avec le reste)", plasma.category, "fabrication");
  checkNum("Coût de la tâche (5h × 112$/h)", plasma.cost, 560);
  check("Aucune tâche n'a de subassemblyId — réserve générale du projet, pas un sous-assemblage de Marc", tasks.every(t => !("subassemblyId" in t)), true);
}
{
  const tasks = amendmentTasks("AV-043", { fabrication: 0, conception: 5 });
  checkNum("Catégorie à 0h n'est pas incluse", tasks.length, 1);
}

console.log("\n--- Facturation de l'avenant — même mécanisme que les extras d'installation ---");
{
  const calc = calculateAmendment({ conception: 10 }, { marginPct: 20, backupPct: 0, projectBackupRate: 112, purchases: 0 });
  const request = amendmentInvoiceRequest("AV-042", calc);
  checkNum("Montant = prix de vente de l'avenant", request.amount, calc.sale);
  check("En attente au départ, pas encore de facture", request.status, "pending");
  check("Aucune facture liée avant traitement par Administration", request.invoice, null);
}

console.log(`\n${passed} réussi(s), ${failed} échoué(s)`);
process.exit(failed > 0 ? 1 : 0);
