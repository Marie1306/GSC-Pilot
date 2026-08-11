// Tests — node contacts.test.js
import { ensureContact } from "./contacts.js";

let passed = 0, failed = 0;
function check(label, actual, expected) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  console.log(`${ok ? "PASS" : "FAIL"} — ${label} (attendu ${JSON.stringify(expected)}, obtenu ${JSON.stringify(actual)})`);
  if (ok) passed++; else failed++;
}
function checkNum(label, actual, expected) {
  const ok = actual === expected;
  console.log(`${ok ? "PASS" : "FAIL"} — ${label} (attendu ${expected}, obtenu ${actual})`);
  if (ok) passed++; else failed++;
}

console.log("--- Création + dédoublonnage à travers 3 sources ---");
{
  const contacts = [];
  ensureContact(contacts, { company: "Client Test", contactName: "Jean Tremblay", requestType: "project" });
  checkNum("1 contact après le projet", contacts.length, 1);

  ensureContact(contacts, { company: "Client Test", contactName: "Jean Tremblay", requestType: "rolling" });
  checkNum("Toujours 1 contact après le roulement (même nom)", contacts.length, 1);
  check("Les deux catégories sont présentes", contacts[0].categories, ["Client", "Projet", "Roulement"]);

  ensureContact(contacts, { company: "Client Test", contactName: "Jean Tremblay", requestType: "service" });
  check("Trois catégories après un appel de service pour la même personne", contacts[0].categories, ["Client", "Projet", "Roulement", "Service"]);
}

console.log("\n--- Dédoublonnage par courriel plutôt que nom ---");
{
  const contacts = [];
  ensureContact(contacts, { company: "A", contactName: "Alice", email: "alice@test.com", requestType: "project" });
  ensureContact(contacts, { company: "A", contactName: "Alice Tremblay-Roy", email: "alice@test.com", requestType: "rolling" });
  checkNum("Même courriel = même contact, même si le nom diffère légèrement", contacts.length, 1);
}

console.log("\n--- Personnes différentes, même compagnie : pas fusionnées ---");
{
  const contacts = [];
  ensureContact(contacts, { company: "Entreprise X", contactName: "Personne A", requestType: "project" });
  ensureContact(contacts, { company: "Entreprise X", contactName: "Personne B", requestType: "project" });
  checkNum("2 contacts distincts pour 2 personnes de la même compagnie", contacts.length, 2);
}

console.log(`\n${passed} réussi(s), ${failed} échoué(s)`);
process.exit(failed > 0 ? 1 : 0);
