import { describe, it, expect } from "vitest";
import { ensureContact } from "@gsc-pilot/business-rules";
import { REQUEST_TYPES, URGENCIES, SETTABLE_STATUSES } from "./service.js";

describe("Vocabulaire des demandes clients (vérifié dans le prototype v19, pas deviné)", () => {
  it("les 4 types de demande correspondent au formulaire réel", () => {
    expect(REQUEST_TYPES).toEqual(["project", "rolling", "service", "information"]);
  });
  it("les 3 niveaux d'urgence correspondent au formulaire réel", () => {
    expect(URGENCIES).toEqual(["urgent", "normal", "discuss"]);
  });
  it("statuts modifiables manuellement pour cette étape — 'converted' réservé à la future conversion", () => {
    expect(SETTABLE_STATUSES).toEqual(["new", "in_progress", "lost"]);
  });
});

describe("ensureContact — requestType 'information' (pas 'info') donne bien la catégorie Information", () => {
  it("une demande de type information catégorise le contact correctement", () => {
    const contact = ensureContact([], {
      email: "client@example.com",
      contactName: "Alex Client",
      company: "Client inc.",
      requestType: "information",
    });
    expect(contact.categories).toEqual(["Client", "Information"]);
  });
});
