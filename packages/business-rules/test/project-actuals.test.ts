import { describe, it, expect } from "vitest";
import { actualHoursByCategory } from "../src/project-actuals.js";

describe("Réel par catégorie (punchs approuvés)", () => {
  const entries = [
    { category: "fabrication", status: "approved", roundedMinutes: 780, costRate: 89.85 }, // 13h, 1168,05$
    { category: "fabrication", status: "approved", roundedMinutes: 660, costRate: 92.04 }, // 11h, 1012,44$
    { category: "conception", status: "approved", roundedMinutes: 1020, costRate: 99.81 }, // 17h, 1696,77$
    { category: "conception", status: "submitted", roundedMinutes: 60, costRate: 99.81 }, // pas approuvé, exclu
  ];
  const byCategory = actualHoursByCategory(entries);
  const fabrication = byCategory.find((row) => row.category === "fabrication");
  const conception = byCategory.find((row) => row.category === "conception");

  it("regroupe par catégorie (2 catégories)", () => expect(byCategory.length).toBe(2));
  it("fabrication : 24h", () => expect(fabrication?.hours).toBe(24));
  it("fabrication : coût = somme des punchs (13×89,85 + 11×92,04)", () => expect(fabrication?.cost).toBeCloseTo(2180.49, 2));
  it("conception : 17h (le punch non approuvé est exclu)", () => expect(conception?.hours).toBe(17));
  it("conception : coût réel gelé au punch (99,81$/h), pas le taux budgétaire", () =>
    expect(conception?.cost).toBeCloseTo(1696.77, 2));
  it("tableau vide sans punchs", () => expect(actualHoursByCategory([]).length).toBe(0));
});
