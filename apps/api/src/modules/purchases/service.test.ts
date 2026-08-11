import { describe, it, expect } from "vitest";
import { buildFrozenThresholdsMap } from "./service.js";

describe("buildFrozenThresholdsMap", () => {
  it("utilise le seuil gelé sur la demande, jamais un autre montant", () => {
    const map = buildFrozenThresholdsMap({ category: { name: "Outillage" }, thresholdAmountAtSubmission: 5000 });
    expect(map).toEqual({ Outillage: 5000 });
  });

  it("reste correct même si le seuil ACTUEL de la catégorie a changé depuis (confirmé le 12 août 2026 : jamais rétroactif)", () => {
    // Simule une demande soumise quand le seuil était 5000$, même si la catégorie affiche maintenant 2000$ ailleurs.
    const requestFrozenAt5000 = { category: { name: "Outillage" }, thresholdAmountAtSubmission: 5000 };
    const map = buildFrozenThresholdsMap(requestFrozenAt5000);
    expect(map.Outillage).toBe(5000); // pas 2000 — la valeur gelée l'emporte toujours
  });

  it("retourne une carte vide sans catégorie (liste rapide) — jamais de seuil", () => {
    expect(buildFrozenThresholdsMap({ category: null, thresholdAmountAtSubmission: null })).toEqual({});
  });

  it("retourne une carte vide si le seuil gelé est manquant même avec une catégorie (garde défensive)", () => {
    expect(buildFrozenThresholdsMap({ category: { name: "Outillage" }, thresholdAmountAtSubmission: null })).toEqual({});
  });
});
