/**
 * GSC Pilot — Soumissions (14 novembre 2026)
 *
 * Quantité × prix unitaire par ligne (ex. "1x 1 000$" dans les vraies
 * soumissions de Marie, confirmé avec de vrais exemples) — même formule que
 * externalSaleLineAmount (external-sales.ts), dupliquée ici plutôt que
 * réutilisée sous un nom propre à un autre module (même principe que
 * round2, déjà dupliqué localement dans external-sales.ts et treasury.ts —
 * patron établi de ce projet pour un utilitaire d'arrondi trivial).
 */
function round2(value: number): number {
  return Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100;
}

export function soumissionLineAmount(qty: number, unitPrice: number): number {
  return round2(Number(qty || 0) * Number(unitPrice || 0));
}
