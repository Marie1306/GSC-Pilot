// Porté 1-pour-1 depuis docs/handoff/03-modules-v01/test.js (checks BUD-04, MARG-01, MARG-02).
import { describe, it, expect } from "vitest";
import { saleFromCost, projectMargin } from "../src/margin.js";

describe("BUD-04 : prix de vente", () => {
  it("10 000$ avant marge, marge 30%", () => {
    expect(saleFromCost(10000, 30)).toBeCloseTo(14285.71, 2);
  });
});

describe("MARG-01 / MARG-02 : marge réelle", () => {
  it("MARG-01 marge $", () => {
    const m1 = projectMargin(22439.08, 1415, 300);
    expect(m1.grossMargin).toBeCloseTo(20724.08, 2);
  });
  it("MARG-01 marge %", () => {
    const m1 = projectMargin(22439.08, 1415, 300);
    expect(m1.grossMarginPct).toBeCloseTo(92.36, 2);
  });
  it("MARG-02 prix vendu = 0, pas de NaN/Infinity", () => {
    const m2 = projectMargin(0, 0, 0);
    expect(m2.grossMarginPct).toBe(0);
  });
});
