// Tests — un scénario par règle confirmée dans GSC_Pilot_Specification_confirmee.md
// Lancer : node roles.test.js
import * as P from "./roles.js";

let passed = 0, failed = 0;
function check(label, actual, expected) {
  const ok = actual === expected;
  console.log(`${ok ? "PASS" : "FAIL"} — ${label} (attendu ${expected}, obtenu ${actual})`);
  if (ok) passed++; else failed++;
}

const { OWNER, ADMIN, BOSS, MEMBER, WAREHOUSE } = P.ROLES;

console.log("--- Visibilité financière (principe général) ---");
check("Direction voit les valeurs", P.canSeeFinancialValues(OWNER), true);
check("Employé ne voit jamais de valeurs", P.canSeeFinancialValues(MEMBER), false);
check("Magasinier ne voit jamais de valeurs", P.canSeeFinancialValues(WAREHOUSE), false);

console.log("\n--- Achats directs de projet (jamais de seuil) ---");
check("Administration peut saisir", P.canEnterProjectPurchase(ADMIN), true);
check("Employé ne peut pas saisir", P.canEnterProjectPurchase(MEMBER), false);
check("Direction approuve peu importe le montant", P.canApproveProjectPurchase({}, OWNER), true);
check("Administration ne peut jamais approuver elle-même", P.canApproveProjectPurchase({}, ADMIN), false);

console.log("\n--- Demandes d'achat (seuil par catégorie) ---");
const thresholds = { fabrication: 5000 };
check("Sous le seuil : Direction approuve", P.canApprovePurchaseRequest({}, OWNER, { category: "fabrication", amount: 1000 }, thresholds), true);
check("Sous le seuil : Propriétaire ne peut pas (pas nécessaire)", P.canApprovePurchaseRequest({}, BOSS, { category: "fabrication", amount: 1000 }, thresholds), false);
check("Au-dessus du seuil : seul le Propriétaire approuve", P.canApprovePurchaseRequest({}, BOSS, { category: "fabrication", amount: 9000 }, thresholds), true);
check("Au-dessus du seuil : Direction seule ne suffit plus", P.canApprovePurchaseRequest({}, OWNER, { category: "fabrication", amount: 9000 }, thresholds), false);
check("Achat rejeté par le Propriétaire : jamais re-soumis", P.canResubmitRejectedPurchase(), false);
check("Employé voit son propre achat", P.canViewPurchase(MEMBER, { requester: "emp-1" }, "emp-1"), true);
check("Employé ne voit pas l'achat d'un autre", P.canViewPurchase(MEMBER, { requester: "emp-2" }, "emp-1"), false);

console.log("\n--- Délégation ---");
check("Seule la Direction peut mettre en place une délégation", P.canGrantDelegation(OWNER), true);
check("Le Propriétaire ne peut pas configurer sa propre délégation", P.canGrantDelegation(BOSS), false);
check("Administration ne peut pas configurer une délégation", P.canGrantDelegation(ADMIN), false);
const activeDelegation = {
  delegation: { delegatePersona: BOSS, start: "2026-08-01", end: "2026-08-31", permissions: ["purchases", "hours"] },
};
const today = new Date("2026-08-15T12:00:00");
check("Délégué actif peut approuver un achat direct pendant la période", P.canApproveProjectPurchase(activeDelegation, BOSS, ), true);
check("Délégation hors période = inactive", P.delegationActive(activeDelegation, BOSS, "purchases", new Date("2026-09-15")), false);
check("Délégation sur catégorie non cochée = inactive", P.delegationActive(activeDelegation, BOSS, "service", today), false);
check("Administration non désignée ne peut pas agir comme Direction", P.canApproveProjectPurchase(activeDelegation, ADMIN), false);

console.log("\n--- Appels de service ---");
check("Direction voit les prix", P.canSeeServicePricing(OWNER), true);
check("Propriétaire voit aussi les prix", P.canSeeServicePricing(BOSS), true);
check("Technicien ne voit jamais de prix", P.canSeeServicePricing(MEMBER), false);
check("Seule la Direction fixe le prix des pièces", P.canPriceServiceParts(OWNER), true);
check("Administration ne peut pas fixer le prix des pièces", P.canPriceServiceParts(ADMIN), false);
check("Magasinier hors de la portée des appels de service", P.canAccessServiceCalls(WAREHOUSE), false);

console.log("\n--- Budgétaire ---");
check("Direction crée toujours", P.canCreateBudgetFromRequest(OWNER), true);
check("Propriétaire crée aussi, sans condition de transmission", P.canCreateBudgetFromRequest(BOSS), true);
check("Administration ne crée jamais de budgétaire", P.canCreateBudgetFromRequest(ADMIN), false);
check("Administration ne modifie jamais un budgétaire", P.canModifyBudget(ADMIN), false);
check("Employé n'accède jamais au budgétaire", P.canAccessBudget(MEMBER), false);

console.log("\n--- Punchs ---");
check("Direction approuve les punchs", P.canApprovePunch({}, OWNER), true);
check("Administration n'approuve pas les punchs", P.canApprovePunch({}, ADMIN), false);
check("Employé corrige son punch avant approbation", P.canEditOwnPunch(MEMBER, { employee: "emp-1", status: "submitted" }, "emp-1"), true);
check("Employé ne peut plus corriger après approbation", P.canEditOwnPunch(MEMBER, { employee: "emp-1", status: "approved" }, "emp-1"), false);

console.log("\n--- Facturation ---");
check("Direction demande la facturation", P.canRequestInvoice(OWNER), true);
check("Administration ne demande pas (elle traite)", P.canRequestInvoice(ADMIN), false);
check("Administration crée une facture", P.canCreateInvoiceRecord(ADMIN), true);
check("Direction crée aussi une facture", P.canCreateInvoiceRecord(OWNER), true);
check("Propriétaire ne crée jamais de facture", P.canCreateInvoiceRecord(BOSS), false);
check("Direction enregistre le paiement", P.canRecordPayment(OWNER), true);
check("Administration enregistre aussi le paiement", P.canRecordPayment(ADMIN), true);
check("Direction met en suspens", P.canHoldInvoice(OWNER), true);
check("Propriétaire ne met jamais en suspens", P.canHoldInvoice(BOSS), false);

console.log("\n--- Livraisons / Roulements ---");
check("Direction marque la production complétée", P.canMarkProductionComplete(OWNER), true);
check("Propriétaire ne marque jamais la production complétée", P.canMarkProductionComplete(BOSS), false);
check("Administration ne marque pas la production complétée", P.canMarkProductionComplete(ADMIN), false);
check("Direction choisit le mode de sortie", P.canChooseFulfillmentMode(OWNER), true);
check("Administration choisit aussi le mode de sortie", P.canChooseFulfillmentMode(ADMIN), true);
check("Propriétaire ne choisit jamais le mode de sortie", P.canChooseFulfillmentMode(BOSS), false);
check("Direction crée un roulement directement", P.canCreateRollingDirectly(OWNER), true);
check("Propriétaire crée aussi un roulement directement", P.canCreateRollingDirectly(BOSS), true);
check("Administration ne crée pas de roulement directement", P.canCreateRollingDirectly(ADMIN), false);
check("Direction crée un projet directement", P.canCreateProjectDirectly(OWNER), true);
check("Propriétaire crée aussi un projet directement", P.canCreateProjectDirectly(BOSS), true);
check("Administration ne crée pas de projet directement", P.canCreateProjectDirectly(ADMIN), false);

console.log("\n--- Paramètres ---");
check("Direction accède aux Paramètres", P.canAccessSettings(OWNER), true);
check("Administration n'accède jamais aux Paramètres", P.canAccessSettings(ADMIN), false);
check("Administration ne modifie jamais un taux horaire", P.canModifyEmployeeRate(ADMIN), false);

console.log(`\n${passed} réussi(s), ${failed} échoué(s)`);
process.exit(failed > 0 ? 1 : 0);
