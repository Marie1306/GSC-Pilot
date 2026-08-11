// Porté 1-pour-1 depuis docs/handoff/03-modules-v01/fulfillment.test.js (11 assertions).
import { describe, it, expect } from "vitest";
import { FULFILLMENT_MODES, fulfillmentClosesEntity, chooseFulfillment, confirmFulfillment, type FulfillmentEntity } from "../src/fulfillment.js";

describe("Quels modes ferment l'entité", () => {
  it("Bon de livraison ferme", () => expect(fulfillmentClosesEntity(FULFILLMENT_MODES.WAREHOUSE)).toBe(true));
  it("Tiers ferme", () => expect(fulfillmentClosesEntity(FULFILLMENT_MODES.MANUAL)).toBe(true));
  it("Ramassage ferme", () => expect(fulfillmentClosesEntity(FULFILLMENT_MODES.PICKUP)).toBe(true));
  it("Installation NE ferme PAS — travail encore à venir", () =>
    expect(fulfillmentClosesEntity(FULFILLMENT_MODES.INSTALLATION)).toBe(false));
});

describe("Choisir un mode de sortie", () => {
  it("Refuse si production non complétée", () => {
    expect(() => chooseFulfillment({ productionCompleted: false }, FULFILLMENT_MODES.PICKUP)).toThrow();
  });
  it("Bon de livraison assigne un livreur et statut planned", () => {
    const entity: FulfillmentEntity = { productionCompleted: true };
    chooseFulfillment(entity, FULFILLMENT_MODES.WAREHOUSE, { driverId: "emp-3", address: "123 rue Test" });
    expect(entity.fulfillmentDriver).toBe("emp-3");
    expect(entity.fulfillmentStatus).toBe("planned");
  });
  it("Installation → statut installation_planned", () => {
    const entity: FulfillmentEntity = { productionCompleted: true };
    chooseFulfillment(entity, FULFILLMENT_MODES.INSTALLATION);
    expect(entity.fulfillmentStatus).toBe("installation_planned");
  });
});

describe("Confirmer un ramassage/tiers", () => {
  it("billingReady activé et statut ready_invoice", () => {
    const entity: FulfillmentEntity = { productionCompleted: true, fulfillmentMode: FULFILLMENT_MODES.PICKUP };
    confirmFulfillment(entity, "Client venu chercher lui-même");
    expect(entity.billingReady).toBe(true);
    expect(entity.status).toBe("ready_invoice");
  });
  it("Refuse de 'confirmer' un mode installation (ne se ferme pas ainsi)", () => {
    const entity: FulfillmentEntity = { productionCompleted: true, fulfillmentMode: FULFILLMENT_MODES.INSTALLATION };
    expect(() => confirmFulfillment(entity)).toThrow();
  });
});
