// Tests — node audit-log.test.js
import { logPunchReassignment } from "./audit-log.js";

let passed = 0, failed = 0;
function check(label, actual, expected) {
  const ok = actual === expected;
  console.log(`${ok ? "PASS" : "FAIL"} — ${label} (attendu ${expected}, obtenu ${actual})`);
  if (ok) passed++; else failed++;
}

console.log("--- Réaffectation de punch ---");
{
  const log = [];
  const entry = logPunchReassignment(log, {
    entryId: "TE-1", fromReference: "PRJ-100", toReference: "PRJ-101", reassignedBy: "owner",
  });
  check("Entrée ajoutée au journal", log.length, 1);
  check("Ancien dossier enregistré", entry.fromReference, "PRJ-100");
  check("Nouveau dossier enregistré", entry.toReference, "PRJ-101");
  check("Justification vide acceptée (non obligatoire)", entry.justification, "");
}
{
  const log = [];
  let threw = false;
  try { logPunchReassignment(log, { entryId: "TE-1", fromReference: "PRJ-100" }); } catch (e) { threw = true; }
  check("Refuse une entrée incomplète", threw, true);
}

console.log(`\n${passed} réussi(s), ${failed} échoué(s)`);
process.exit(failed > 0 ? 1 : 0);
