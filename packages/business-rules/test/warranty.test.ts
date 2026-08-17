import { describe, it, expect } from "vitest";
import { isUnderWarranty, projectLifecycleTab } from "../src/warranty.js";

const now = new Date("2026-08-17T12:00:00Z");
const future = "2027-08-17T00:00:00Z";
const past = "2026-01-01T00:00:00Z";

describe("isUnderWarranty", () => {
  it("nul = pas en garantie", () => expect(isUnderWarranty(null, now)).toBe(false));
  it("absent = pas en garantie", () => expect(isUnderWarranty(undefined, now)).toBe(false));
  it("date future = en garantie", () => expect(isUnderWarranty(future, now)).toBe(true));
  it("date passée = garantie expirée", () => expect(isUnderWarranty(past, now)).toBe(false));
});

describe("projectLifecycleTab — onglet dérivé, jamais un statut stocké (confirmé 17 août 2026)", () => {
  it("actif : ni fermé ni en garantie", () => {
    expect(projectLifecycleTab({ closedAt: null, warrantyEndsAt: null }, now)).toBe("active");
  });
  it("fermé : closedAt rempli, pas en garantie", () => {
    expect(projectLifecycleTab({ closedAt: "2026-08-10T00:00:00Z", warrantyEndsAt: null }, now)).toBe("closed");
  });
  it("garantie : warrantyEndsAt futur, prime sur closedAt vide", () => {
    expect(projectLifecycleTab({ closedAt: null, warrantyEndsAt: future }, now)).toBe("warranty");
  });
  it("garantie : prime même si le projet est fermé (les deux coexistent, confirmé)", () => {
    expect(projectLifecycleTab({ closedAt: "2026-08-10T00:00:00Z", warrantyEndsAt: future }, now)).toBe("warranty");
  });
  it("garantie expirée + fermé : retombe dans fermés tout seul, sans geste manuel", () => {
    expect(projectLifecycleTab({ closedAt: "2026-08-10T00:00:00Z", warrantyEndsAt: past }, now)).toBe("closed");
  });
  it("garantie expirée, jamais fermé : retombe dans actifs", () => {
    expect(projectLifecycleTab({ closedAt: null, warrantyEndsAt: past }, now)).toBe("active");
  });
});
