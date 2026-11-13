// Porté 1-pour-1 depuis docs/handoff/03-modules-v01/billing.test.js (15 assertions).
import { describe, it, expect } from "vitest";
import { computeBillingPlan, invoiceStatus, installationOverage, computeInvoiceTax } from "../src/billing.js";

describe("Plan de facturation par défaut (exemple confirmé : projet à 1000$)", () => {
  const plan = computeBillingPlan(1000);
  it("Cycle 1 (signature) = 250$", () => expect(plan[0]?.amount).toBe(250));
  it("Cycle 2 (conception) = 250$", () => expect(plan[1]?.amount).toBe(250));
  it("Cycle 3 (livraison) = 400$", () => expect(plan[2]?.amount).toBe(400));
  it("Cycle 4 (30j post-livraison) = 100$", () => expect(plan[3]?.amount).toBe(100));
});

describe("Override par projet (exemple réel confirmé : 30% conception / 70% livraison)", () => {
  const planCustom = computeBillingPlan(10000, [
    { label: "Après conception", pct: 30 },
    { label: "Livraison", pct: 70 },
  ]);
  it("30% de 10 000$ = 3 000$", () => expect(planCustom[0]?.amount).toBe(3000));
  it("70% de 10 000$ = 7 000$", () => expect(planCustom[1]?.amount).toBe(7000));
});

describe("Plan invalide (ne totalise pas 100%)", () => {
  it("Rejette un plan qui ne totalise pas 100%", () => {
    expect(() => computeBillingPlan(1000, [{ label: "x", pct: 50 }])).toThrow();
  });
});

describe("Statut de facture (logique v19 reprise à l'identique)", () => {
  it("Payée si solde nul", () => {
    expect(invoiceStatus({ amount: 500, paid: 500, due: "2026-01-01" })).toBe("paid");
  });
  it("En suspens si marquée ainsi", () => {
    expect(invoiceStatus({ amount: 500, paid: 0, status: "on_hold", due: "2099-01-01" })).toBe("on_hold");
  });
  it("En retard si échéance dépassée", () => {
    expect(invoiceStatus({ amount: 500, paid: 0, due: "2020-01-01" }, new Date("2026-08-09"))).toBe("overdue");
  });
  it("Envoyée sinon", () => {
    expect(invoiceStatus({ amount: 500, paid: 0, due: "2099-01-01" }, new Date("2026-08-09"))).toBe("sent");
  });
});

describe("Extras d'installation (confirmé et approuvé le 8 août)", () => {
  it("10h supplémentaires détectées", () => {
    const extra = installationOverage(20, 30, 95);
    expect(extra?.hours).toBe(10);
  });
  it("Montant = 10h × 95$/h = 950$", () => {
    const extra = installationOverage(20, 30, 95);
    expect(extra?.amount).toBe(950);
  });
  it("Aucun extra si pas de dépassement", () => {
    expect(installationOverage(20, 15, 95)).toBe(null);
  });
  it("Aucun extra si heures exactes", () => {
    expect(installationOverage(20, 20, 95)).toBe(null);
  });
});

describe("Taxes de facturation — TPS/TVQ séparées (confirmé le 13 novembre 2026)", () => {
  it("1000$ à 5% TPS / 9.975% TVQ : TPS = 50$, TVQ = 99.75$, total = 1149.75$", () => {
    const tax = computeInvoiceTax(1000, 5, 9.975);
    expect(tax.amountBeforeTax).toBe(1000);
    expect(tax.tpsAmount).toBe(50);
    expect(tax.tvqAmount).toBe(99.75);
    expect(tax.totalWithTax).toBe(1149.75);
  });
  it("9.975% n'est jamais arrondi à 9.98 avant le calcul", () => {
    const tax = computeInvoiceTax(10000, 5, 9.975);
    expect(tax.tvqAmount).toBe(997.5);
  });
  it("Taux à 0% : aucune taxe ajoutée", () => {
    const tax = computeInvoiceTax(500, 0, 0);
    expect(tax.tpsAmount).toBe(0);
    expect(tax.tvqAmount).toBe(0);
    expect(tax.totalWithTax).toBe(500);
  });
});
