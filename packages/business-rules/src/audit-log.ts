/**
 * GSC Pilot — Journal d'audit
 *
 * Confirmé le 7 août 2026 : une réaffectation volontaire d'un punch d'un
 * dossier à un autre doit être journalisée (ancien dossier, nouveau
 * dossier, personne, date/heure). Justification laissée au choix — non
 * obligatoire.
 *
 * Portée volontairement limitée à cette seule règle confirmée. La v19 a
 * une section « Journal d'audit » plus large dans ses Paramètres — le
 * contenu exact de ce qu'elle couvre au-delà des punchs n'a pas été
 * vérifié ni confirmé; à étendre seulement une fois clarifié, pas deviné.
 *
 * Porté depuis docs/handoff/03-modules-v01/audit-log.js — typage ajouté
 * uniquement, aucune ligne de logique changée (voir CLAUDE.md).
 */

export interface PunchReassignmentInput {
  entryId: string;
  fromReference: string;
  toReference: string;
  reassignedBy: string;
  justification?: string;
}

export interface AuditLogEntry {
  type: "punch_reassignment";
  entryId: string;
  fromReference: string;
  toReference: string;
  reassignedBy: string;
  justification: string;
  at: string;
}

export function logPunchReassignment(log: AuditLogEntry[], input: PunchReassignmentInput): AuditLogEntry {
  const { entryId, fromReference, toReference, reassignedBy, justification = "" } = input;
  if (!entryId || !fromReference || !toReference || !reassignedBy) {
    throw new Error("Réaffectation de punch : entryId, fromReference, toReference et reassignedBy sont requis.");
  }
  const entry: AuditLogEntry = {
    type: "punch_reassignment",
    entryId,
    fromReference,
    toReference,
    reassignedBy,
    justification,
    at: new Date().toISOString(),
  };
  log.push(entry);
  return entry;
}
