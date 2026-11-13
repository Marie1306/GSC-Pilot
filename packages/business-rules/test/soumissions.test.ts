import { describe, it, expect } from "vitest";
import { soumissionLineAmount } from "../src/soumissions.js";

describe("soumissionLineAmount", () => {
  it("1x 1000$ — exemple réel confirmé avec l'utilisatrice", () => {
    expect(soumissionLineAmount(1, 1000)).toBe(1000);
  });
  it("qty × prix unitaire, arrondi à 2 décimales", () => {
    expect(soumissionLineAmount(3, 12.995)).toBeCloseTo(38.99, 2);
  });
  it("qty ou prix manquant → 0, jamais NaN", () => {
    expect(soumissionLineAmount(0, 0)).toBe(0);
  });
});
