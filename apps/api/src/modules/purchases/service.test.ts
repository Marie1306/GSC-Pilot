import { describe, it, expect } from "vitest";
import { resolveNextPurchaseRequestNumber, formatPurchaseRequestDisplayId } from "./service.js";

/**
 * Confirmé le 14 août 2026 : numéro sur 5 chiffres (pas 4), remise à zéro
 * automatique dès la première demande d'une nouvelle année d'affaires
 * (heure de l'Est/Québec — voir currentBusinessYear, pas testée ici
 * directement puisqu'elle dépend de l'heure réelle, mais resolve... prend
 * l'année en second paramètre facultatif exactement pour rester testable
 * sans dépendre du moment où ce test roule).
 */
describe("resolveNextPurchaseRequestNumber", () => {
  it("même année : continue le compteur existant (règle du plus haut +1, déjà confirmée)", () => {
    const result = resolveNextPurchaseRequestNumber({ nextPurchaseRequestNumber: 87, purchaseRequestNumberYear: 2026 }, 2026);
    expect(result).toEqual({ year: 2026, number: 87 });
  });

  it("nouvelle année : remise à zéro à 1, peu importe où en était le compteur précédent", () => {
    const result = resolveNextPurchaseRequestNumber({ nextPurchaseRequestNumber: 9999, purchaseRequestNumberYear: 2026 }, 2027);
    expect(result).toEqual({ year: 2027, number: 1 });
  });

  it("première demande jamais soumise (année à sa valeur par défaut) : démarre à 1", () => {
    const result = resolveNextPurchaseRequestNumber({ nextPurchaseRequestNumber: 1, purchaseRequestNumberYear: 2026 }, 2026);
    expect(result).toEqual({ year: 2026, number: 1 });
  });
});

describe("formatPurchaseRequestDisplayId", () => {
  it("format DA-AAAA-NNNNN, 5 chiffres avec zéros de tête", () => {
    expect(formatPurchaseRequestDisplayId(2026, 1)).toBe("DA-2026-00001");
    expect(formatPurchaseRequestDisplayId(2026, 87)).toBe("DA-2026-00087");
  });

  it("ne tronque pas un numéro à 5 chiffres ou plus (pas de zéro de tête superflu)", () => {
    expect(formatPurchaseRequestDisplayId(2026, 12345)).toBe("DA-2026-12345");
    expect(formatPurchaseRequestDisplayId(2026, 123456)).toBe("DA-2026-123456");
  });
});
