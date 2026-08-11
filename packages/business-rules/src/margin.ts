/**
 * GSC Pilot — Marge et prix de vente
 * Formules confirmées dans le dossier de vérification v19 (BUD-04, MARG-01, MARG-02).
 *
 * Porté depuis docs/handoff/03-modules-v01/margin.js — typage ajouté
 * uniquement, aucune ligne de logique changée (voir CLAUDE.md).
 */

/**
 * Échelle de complexité → marge (%). Un niveau de 0 à 10, choisi par
 * catégorie ou pour le back-up, détermine la marge appliquée au prix de
 * vente. Confirmée à l'identique dans backup.ts (le même mécanisme régit
 * les deux — et, depuis la confirmation du 11 août 2026, chaque section du
 * budgétaire indépendamment, voir sections.ts). Source : table active du
 * prototype v19 (aucune version divergente trouvée pour celle-ci — une
 * seule définition dans tout le fichier).
 */
export const COMPLEXITY_MARKUP_SCALE = Object.freeze({
  0: 20,
  1: 22,
  2: 23,
  3: 24,
  4: 25,
  5: 30,
  6: 35,
  7: 38,
  8: 42,
  9: 50,
  10: 60,
} as const);

export type ComplexityLevel = keyof typeof COMPLEXITY_MARKUP_SCALE;

export function complexityMarkup(level: number): number {
  const clamped = Math.max(0, Math.min(10, Math.round(Number(level || 0)))) as ComplexityLevel;
  return COMPLEXITY_MARKUP_SCALE[clamped];
}

function round2(value: number): number {
  return Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100;
}

/** Prix de vente = coût avant marge / (1 - marge). Jamais de division par zéro. */
export function saleFromCost(baseCost: number, marginPct: number): number {
  const cost = Number(baseCost || 0);
  const margin = Math.max(0, Math.min(99.99, Number(marginPct || 0)));
  return cost > 0 ? round2(cost / (1 - margin / 100)) : 0;
}

export interface ProjectMarginResult {
  grossMargin: number;
  grossMarginPct: number;
}

/**
 * Marge réelle d'un projet. Garde explicite contre NaN/Infinity quand le
 * prix vendu est 0 (MARG-02) : retourne 0 %, jamais une division invalide.
 */
export function projectMargin(sold: number, laborCost: number, purchases: number): ProjectMarginResult {
  const soldNum = Number(sold || 0);
  const grossMargin = soldNum - Number(laborCost || 0) - Number(purchases || 0);
  const grossMarginPct = soldNum ? (grossMargin / soldNum) * 100 : 0;
  return { grossMargin: round2(grossMargin), grossMarginPct };
}
