/**
 * GSC Pilot — Identifiants canoniques de catégories
 *
 * NOUVEAU module (pas un port) — introduit pendant la construction de la
 * fondation pour donner un seul vocabulaire aux catégories déjà utilisées,
 * de façon cohérente, dans backup.ts et amendments.ts (vérifié directement
 * dans le code : les deux utilisent déjà exactement les mêmes identifiants
 * — voir CLAUDE.md pour le détail de cette vérification).
 *
 * Les sous-catégories de fabrication sont volontairement modélisées comme
 * des DONNÉES (BudgetModelRow, voir apps/api/prisma/schema.prisma), pas un
 * enum codé en dur ici — la spécification confirme que Direction peut les
 * renommer/ajouter/retirer depuis le modèle de budgétaire. La liste
 * ci-dessous reflète seulement les 5 sous-catégories confirmées au moment
 * de la fondation (pour les seeds/tests), pas une contrainte figée.
 */

/** Les 5 sections fixes d'un budgétaire — back-up calculé sur un sous-ensemble de celles-ci (voir backup.ts). */
export const BUDGET_CATEGORIES = Object.freeze([
  "conception",
  "fabrication",
  "programmation",
  "assemblage",
  "installation",
] as const);
export type BudgetCategory = (typeof BUDGET_CATEGORIES)[number];

/** Sous-catégories de fabrication confirmées au moment de la fondation — extensible en données, pas figé en code. */
export const FABRICATION_SUBCATEGORIES = Object.freeze([
  "fabrication-plasma",
  "fabrication-pliage",
  "fabrication-usinage",
  "fabrication-soudage",
  "fabrication-peinture",
] as const);

/** Même règle que dans amendments.ts/subassembly.ts : une catégorie de fabrication, de base ou sous-catégorie. */
export function isFabricationCategory(category: string): boolean {
  return category === "fabrication" || category.startsWith("fabrication-");
}

/**
 * Statuts d'une demande d'achat — confirmés par lecture directe du
 * mécanisme actif dans la référence v19 (pas seulement la prose de la
 * spécification) : en attente Direction, puis soit autorisée directement
 * (sous le seuil), soit en attente Propriétaire (au-dessus du seuil) avant
 * d'être autorisée. Rejetée est terminal à n'importe quelle étape (voir
 * roles.ts — canResubmitRejectedPurchase).
 */
export const PURCHASE_REQUEST_STATUSES = Object.freeze([
  "owner_pending",
  "boss_pending",
  "authorized",
  "rejected",
] as const);
export type PurchaseRequestStatus = (typeof PURCHASE_REQUEST_STATUSES)[number];
