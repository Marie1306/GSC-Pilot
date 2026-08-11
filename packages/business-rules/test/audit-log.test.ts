// Porté 1-pour-1 depuis docs/handoff/03-modules-v01/audit-log.test.js (5 assertions).
import { describe, it, expect } from "vitest";
import { logPunchReassignment, type AuditLogEntry } from "../src/audit-log.js";

describe("Réaffectation de punch", () => {
  it("entrée complète — ajoutée au journal avec les bons champs", () => {
    const log: AuditLogEntry[] = [];
    const entry = logPunchReassignment(log, {
      entryId: "TE-1",
      fromReference: "PRJ-100",
      toReference: "PRJ-101",
      reassignedBy: "owner",
    });
    expect(log.length).toBe(1);
    expect(entry.fromReference).toBe("PRJ-100");
    expect(entry.toReference).toBe("PRJ-101");
    expect(entry.justification).toBe("");
  });

  it("Refuse une entrée incomplète", () => {
    const log: AuditLogEntry[] = [];
    expect(() =>
      logPunchReassignment(log, { entryId: "TE-1", fromReference: "PRJ-100" } as Parameters<typeof logPunchReassignment>[1]),
    ).toThrow();
  });
});
