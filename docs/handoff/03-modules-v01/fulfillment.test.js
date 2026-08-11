// Tests — node fulfillment.test.js
import { FULFILLMENT_MODES, fulfillmentClosesEntity, chooseFulfillment, confirmFulfillment } from "./fulfillment.js";

let passed = 0, failed = 0;
function check(label, actual, expected) {
  const ok = actual === expected;
  console.log(`${ok ? "PASS" : "FAIL"} — ${label} (attendu ${expected}, obtenu ${actual})`);
  if (ok) passed++; else failed++;
}

console.log("--- Quels modes ferment l'entité ---");
check("Bon de livraison ferme", fulfillmentClosesEntity(FULFILLMENT_MODES.WAREHOUSE), true);
check("Tiers ferme", fulfillmentClosesEntity(FULFILLMENT_MODES.MANUAL), true);
check("Ramassage ferme", fulfillmentClosesEntity(FULFILLMENT_MODES.PICKUP), true);
check("Installation NE ferme PAS — travail encore à venir", fulfillmentClosesEntity(FULFILLMENT_MODES.INSTALLATION), false);

console.log("\n--- Choisir un mode de sortie ---");
{
  let threw = false;
  try { chooseFulfillment({ productionCompleted: false }, FULFILLMENT_MODES.PICKUP); } catch (e) { threw = true; }
  check("Refuse si production non complétée", threw, true);
}
{
  const entity = { productionCompleted: true };
  chooseFulfillment(entity, FULFILLMENT_MODES.WAREHOUSE, { driverId: "emp-3", address: "123 rue Test" });
  check("Bon de livraison assigne un livreur", entity.fulfillmentDriver, "emp-3");
  check("Statut = planned pour le magasinier", entity.fulfillmentStatus, "planned");
}
{
  const entity = { productionCompleted: true };
  chooseFulfillment(entity, FULFILLMENT_MODES.INSTALLATION);
  check("Installation → statut installation_planned", entity.fulfillmentStatus, "installation_planned");
}

console.log("\n--- Confirmer un ramassage/tiers ---");
{
  const entity = { productionCompleted: true, fulfillmentMode: FULFILLMENT_MODES.PICKUP };
  confirmFulfillment(entity, "Client venu chercher lui-même");
  check("billingReady activé", entity.billingReady, true);
  check("Statut du roulement passe à ready_invoice", entity.status, "ready_invoice");
}
{
  const entity = { productionCompleted: true, fulfillmentMode: FULFILLMENT_MODES.INSTALLATION };
  let threw = false;
  try { confirmFulfillment(entity); } catch (e) { threw = true; }
  check("Refuse de 'confirmer' un mode installation (ne se ferme pas ainsi)", threw, true);
}

console.log(`\n${passed} réussi(s), ${failed} échoué(s)`);
process.exit(failed > 0 ? 1 : 0);
