/**
 * GSC Pilot v01 — Journal d'audit
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
 */

export function logPunchReassignment(log, { entryId, fromReference, toReference, reassignedBy, justification = "" }) {
  if (!entryId || !fromReference || !toReference || !reassignedBy) {
    throw new Error("Réaffectation de punch : entryId, fromReference, toReference et reassignedBy sont requis.");
  }
  const entry = {
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
