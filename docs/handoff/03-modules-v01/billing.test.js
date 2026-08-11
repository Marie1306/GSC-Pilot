// Tests — node billing.test.js
import { computeBillingPlan, invoiceStatus, installationOverage, DEFAULT_BILLING_SPLIT } from "./billing.js";

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

console.log("--- Plan de facturation par défaut (exemple confirmé : projet à 1000$) ---");
{
  const plan = computeBillingPlan(1000);
  checkNum("Cycle 1 (signature) = 250$", plan[0].amount, 250);
  checkNum("Cycle 2 (conception) = 250$", plan[1].amount, 250);
  checkNum("Cycle 3 (livraison) = 400$", plan[2].amount, 400);
  checkNum("Cycle 4 (30j post-livraison) = 100$", plan[3].amount, 100);
}

console.log("\n--- Override par projet (exemple réel confirmé : 30% conception / 70% livraison) ---");
{
  const planCustom = computeBillingPlan(10000, [
    { label: "Après conception", pct: 30 },
    { label: "Livraison", pct: 70 },
  ]);
  checkNum("30% de 10 000$ = 3 000$", planCustom[0].amount, 3000);
  checkNum("70% de 10 000$ = 7 000$", planCustom[1].amount, 7000);
}

console.log("\n--- Plan invalide (ne totalise pas 100%) ---");
{
  let threw = false;
  try { computeBillingPlan(1000, [{ label: "x", pct: 50 }]); } catch (e) { threw = true; }
  checkNum("Rejette un plan qui ne totalise pas 100%", threw, true);
}

console.log("\n--- Statut de facture (logique v19 reprise à l'identique) ---");
{
  checkNum("Payée si solde nul", invoiceStatus({ amount: 500, paid: 500, due: "2026-01-01" }), "paid");
  checkNum("En suspens si marquée ainsi", invoiceStatus({ amount: 500, paid: 0, status: "on_hold", due: "2099-01-01" }), "on_hold");
  checkNum("En retard si échéance dépassée", invoiceStatus({ amount: 500, paid: 0, due: "2020-01-01" }, new Date("2026-08-09")), "overdue");
  checkNum("Envoyée sinon", invoiceStatus({ amount: 500, paid: 0, due: "2099-01-01" }, new Date("2026-08-09")), "sent");
}

console.log("\n--- Extras d'installation (confirmé et approuvé le 8 août) ---");
{
  const extra = installationOverage(20, 30, 95);
  checkNum("10h supplémentaires détectées", extra.hours, 10);
  checkNum("Montant = 10h × 95$/h = 950$", extra.amount, 950);
  checkNum("Aucun extra si pas de dépassement", installationOverage(20, 15, 95), null);
  checkNum("Aucun extra si heures exactes", installationOverage(20, 20, 95), null);
}

console.log(`\n${passed} réussi(s), ${failed} échoué(s)`);
process.exit(failed > 0 ? 1 : 0);
