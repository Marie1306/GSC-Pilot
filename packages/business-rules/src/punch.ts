/**
 * GSC Pilot — Punch d'heures (arrondi)
 *
 * Confirmé par l'utilisatrice le 18 août 2026 : l'arrondi se fait TOUJOURS
 * vers le haut (ex. 2 h 03 devient 2 h 15 avec un pas de 15 minutes) —
 * jamais au plus proche ni vers le bas. Le pas lui-même est déjà un champ
 * existant, Settings.punchRoundingMinutes (15 par défaut). L'heure exacte
 * reste conservée séparément (TimeEntry.exactMinutes) — seul le total
 * comptabilisé (TimeEntry.roundedMinutes) est arrondi.
 *
 * Aucune règle de pause dîner ni d'heures hors plage : ces deux détails du
 * prototype v19 ne sont pas confirmés dans la spécification — volontairement
 * absents d'ici tant qu'ils ne le sont pas.
 *
 * Nouveau fichier — le punch d'heures n'existait qu'à l'état de squelette
 * avant cette passe (voir CLAUDE.md), aucun équivalent dans
 * docs/handoff/03-modules-v01/.
 */

/** Arrondit toujours vers le haut, au multiple de `roundingMinutes` suivant (ou égal). Jamais négatif. */
export function roundPunchMinutes(exactMinutes: number, roundingMinutes: number): number {
  const exact = Math.max(0, Number(exactMinutes) || 0);
  const step = Math.max(1, Number(roundingMinutes) || 1);
  return Math.ceil(exact / step) * step;
}
