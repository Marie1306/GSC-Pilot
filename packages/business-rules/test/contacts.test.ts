// Porté 1-pour-1 depuis docs/handoff/03-modules-v01/contacts.test.js (6 assertions).
import { describe, it, expect } from "vitest";
import { ensureContact, type Contact } from "../src/contacts.js";

describe("Création + dédoublonnage à travers 3 sources", () => {
  it("dédoublonne par nom à travers projet/roulement/service", () => {
    const contacts: Contact[] = [];
    ensureContact(contacts, { company: "Client Test", contactName: "Jean Tremblay", requestType: "project" });
    expect(contacts.length).toBe(1);

    ensureContact(contacts, { company: "Client Test", contactName: "Jean Tremblay", requestType: "rolling" });
    expect(contacts.length).toBe(1);
    expect(contacts[0]?.categories).toEqual(["Client", "Projet", "Roulement"]);

    ensureContact(contacts, { company: "Client Test", contactName: "Jean Tremblay", requestType: "service" });
    expect(contacts[0]?.categories).toEqual(["Client", "Projet", "Roulement", "Service"]);
  });
});

describe("Dédoublonnage par courriel plutôt que nom", () => {
  it("même courriel = même contact, même si le nom diffère légèrement", () => {
    const contacts: Contact[] = [];
    ensureContact(contacts, { company: "A", contactName: "Alice", email: "alice@test.com", requestType: "project" });
    ensureContact(contacts, { company: "A", contactName: "Alice Tremblay-Roy", email: "alice@test.com", requestType: "rolling" });
    expect(contacts.length).toBe(1);
  });
});

describe("Personnes différentes, même compagnie : pas fusionnées", () => {
  it("2 contacts distincts pour 2 personnes de la même compagnie", () => {
    const contacts: Contact[] = [];
    ensureContact(contacts, { company: "Entreprise X", contactName: "Personne A", requestType: "project" });
    ensureContact(contacts, { company: "Entreprise X", contactName: "Personne B", requestType: "project" });
    expect(contacts.length).toBe(2);
  });
});
