/**
 * Remise à zéro annuelle des numéros de document (BG/DC/BL/CS/RL/VE) —
 * généralise le patron déjà en place et testé pour les Achats
 * (resolveNextPurchaseRequestNumber/currentBusinessYear,
 * purchases/service.ts) sans toucher à ce fichier (déjà testé, aucune
 * raison de le faire dépendre de ce module partagé).
 *
 * Ajouté le 8 septembre 2026 : avant cette date, seuls les Achats (DA-)
 * avaient une vraie remise à zéro — Budgétaire/Demande client/Livraison/
 * Call de service/Roulement avançaient pour toujours malgré des
 * commentaires de schéma qui suggéraient le contraire. Corrigé sur demande
 * explicite de l'utilisatrice (voir CLAUDE.md).
 */

export function currentBusinessYear(): number {
  return Number(new Intl.DateTimeFormat("en-CA", { timeZone: "America/Toronto", year: "numeric" }).format(new Date()));
}

export function resolveSequentialNumber(state: { next: number; year: number }, year: number = currentBusinessYear()): { year: number; number: number } {
  return { year, number: state.year === year ? state.next : 1 };
}
