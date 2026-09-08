import { describe, expect, it } from "vitest";
import { resolveSequentialNumber } from "./sequentialNumbers.js";

describe("resolveSequentialNumber", () => {
  it("même année : continue le compteur existant", () => {
    expect(resolveSequentialNumber({ next: 135, year: 2026 }, 2026)).toEqual({ year: 2026, number: 135 });
  });

  it("nouvelle année : remise à zéro à 1, peu importe où en était le compteur précédent", () => {
    expect(resolveSequentialNumber({ next: 347, year: 2026 }, 2027)).toEqual({ year: 2027, number: 1 });
  });

  it("premier document jamais soumis (année à sa valeur par défaut) : démarre à 1", () => {
    expect(resolveSequentialNumber({ next: 1, year: 2026 }, 2026)).toEqual({ year: 2026, number: 1 });
  });
});
