/**
 * GSC Pilot — Avenants (changements de commande)
 *
 * Conçu ensemble le 9 août 2026, en réaction à un vrai problème vécu avec
 * ChatGPT : la création d'un avenant générait une catégorie séparée
 * (« AV-fabrication ») plutôt que d'ajouter aux catégories déjà utilisées
 * par le projet — la même incohérence, en pire, que celle qu'on a
 * corrigée dans le calcul principal du back-up.
 *
 * Principe confirmé : un avenant est un AJOUT au projet, jamais une
 * structure séparée. Heures, coût réel, prix de vente, achats — tout
 * s'additionne aux banques existantes du projet, jamais dans un nouveau
 * compartiment.
 *
 * Fabrication seulement se divise en sous-catégories (plasma, pliage,
 * usinage, soudage, peinture) — les 4 autres catégories (Conception,
 * Programmation, Assemblage, Installation) restent chacune un seul bloc,
 * puisqu'elles n'ont pas de sous-catégories ailleurs dans le système.
 * Cette division ne sert QUE la génération des tâches détaillées pour la
 * vue projet et le post-mortem — les calculs financiers ne changent pas,
 * le back-up reste calculé sur le total de Fabrication peu importe la
 * répartition entre sous-catégories.
 *
 * Confirmé : les heures d'un avenant vont dans une réserve générale du
 * projet, jamais dans un sous-assemblage de Marc — lui crée les siens
 * librement et sans limite; l'avenant est une décision de Direction qui
 * connaît déjà les heures nécessaires au moment de le créer, pas besoin
 * de passer par le processus d'incertitude de la conception.
 *
 * Le Gantt agrège déjà tout ça correctement sans code additionnel — voir
 * `v16CategoryInfo` dans la v19 (alias "plasma", "pliage", "usinage",
 * "soudage", "peinture" -> catégorie canonique "Fabrication").
 *
 * Porté depuis docs/handoff/03-modules-v01/amendments.js — typage ajouté
 * uniquement, aucune ligne de logique changée (voir CLAUDE.md).
 */

function round2(value: number): number {
  return Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100;
}

const isFabrication = (category: string): boolean => category === "fabrication" || category.startsWith("fabrication-");

/** Taux internes par catégorie — mêmes valeurs que la v19 (V17_AMENDMENT_CATEGORIES). */
export const AMENDMENT_INTERNAL_RATES = Object.freeze({
  conception: 117,
  fabrication: 112, // s'applique à toutes les sous-catégories de fabrication
  programmation: 117,
  assemblage: 112,
  installation: 112,
} as const);

/** Catégories admissibles au back-up — mêmes que le calcul principal (confirmé, corrigé le 9 août dans la v19). */
function isBackupEligible(category: string): boolean {
  return isFabrication(category) || category === "programmation" || category === "assemblage";
}

export interface AmendmentCalcOptions {
  marginPct: number;
  backupPct: number;
  projectBackupRate: number;
  purchases?: number;
  internalRates?: Record<string, number>;
}

export interface AmendmentCalcResult {
  laborHours: number;
  laborCost: number;
  backupEligibleHours: number;
  backupHours: number;
  backupCost: number;
  purchases: number;
  totalCost: number;
  sale: number;
  marginPct: number;
}

/**
 * Calcule un avenant. `hoursByCategory` peut inclure plusieurs entrées
 * `fabrication-*` (une par sous-catégorie) — elles sont regroupées sous
 * le taux "fabrication" unique pour le coût, mais gardées distinctes pour
 * la génération de tâches (voir `amendmentTasks`).
 *
 * Confirmé le 9 août 2026 : `projectBackupRate` doit être le taux gelé du
 * budgétaire d'origine de CE projet (celui figé à sa création), jamais le
 * taux actuellement affiché dans les Paramètres si celui-ci a changé
 * depuis. Le coût du back-up utilise ce taux unique — pas une moyenne
 * pondérée des taux internes par catégorie.
 */
export function calculateAmendment(
  hoursByCategory: Record<string, number>,
  { marginPct, backupPct, projectBackupRate, purchases = 0, internalRates = AMENDMENT_INTERNAL_RATES }: AmendmentCalcOptions,
): AmendmentCalcResult {
  let laborHours = 0;
  let laborCost = 0;
  let backupEligibleHours = 0;

  Object.entries(hoursByCategory).forEach(([category, hours]) => {
    const h = Math.max(0, Number(hours || 0));
    const rateKey = isFabrication(category) ? "fabrication" : category;
    const rate = Number(internalRates[rateKey] ?? 0);
    laborHours += h;
    laborCost += h * rate;
    if (isBackupEligible(category)) backupEligibleHours += h;
  });

  const backupHours = round2((backupEligibleHours * Number(backupPct || 0)) / 100);
  const backupCost = round2(backupHours * Number(projectBackupRate || 0));
  const totalCost = round2(laborCost + backupCost + Number(purchases || 0));
  const clampedMargin = Math.max(0, Math.min(99.99, Number(marginPct || 0)));
  const sale = totalCost > 0 ? round2(totalCost / (1 - clampedMargin / 100)) : 0;

  return {
    laborHours: round2(laborHours),
    laborCost: round2(laborCost),
    backupEligibleHours: round2(backupEligibleHours),
    backupHours,
    backupCost,
    purchases: Number(purchases || 0),
    totalCost,
    sale,
    marginPct: clampedMargin,
  };
}

export interface AmendmentProjectLike {
  laborHours?: number;
  laborCost?: number;
  backupHours?: number;
  backupHoursCost?: number;
  plannedPurchases?: number;
  sold?: number;
  invoicePlan?: { pct: number; amount: number; [key: string]: unknown }[];
}

/**
 * Additionne un avenant calculé aux banques existantes du projet — jamais
 * un compartiment séparé. Recalcule aussi le plan de facturation sur le
 * nouveau prix vendu total, avec les mêmes pourcentages (même logique
 * que `billing.ts` — confirmé, comportement déjà correct dans la v19).
 */
export function applyAmendmentToProject<T extends AmendmentProjectLike>(project: T, calc: AmendmentCalcResult): T {
  project.laborHours = round2(Number(project.laborHours || 0) + calc.laborHours);
  project.laborCost = round2(Number(project.laborCost || 0) + calc.laborCost);
  project.backupHours = round2(Number(project.backupHours || 0) + calc.backupHours);
  project.backupHoursCost = round2(Number(project.backupHoursCost || 0) + calc.backupCost);
  project.plannedPurchases = round2(Number(project.plannedPurchases || 0) + calc.purchases);
  project.sold = round2(Number(project.sold || 0) + calc.sale);
  (project.invoicePlan || []).forEach((step) => {
    step.amount = round2((Number(project.sold || 0) * Number(step.pct || 0)) / 100);
  });
  return project;
}

export interface AmendmentTask {
  id: string;
  amendmentId: string;
  category: string;
  subcategory: string;
  hours: number;
  cost: number;
}

/**
 * Génère les tâches détaillées d'un avenant, pour la vue projet et le
 * post-mortem. Fabrication produit une tâche par sous-catégorie fournie;
 * les autres catégories produisent une seule tâche chacune. Toutes
 * portent `category: "fabrication"` (ou leur catégorie propre) pour
 * s'agréger correctement dans le Gantt — voir le fichier d'en-tête.
 * Aucune n'a de `subassemblyId` : réserve générale du projet, jamais
 * rattachée à un sous-assemblage de Marc.
 */
export function amendmentTasks(
  amendmentId: string,
  hoursByCategory: Record<string, number>,
  internalRates: Record<string, number> = AMENDMENT_INTERNAL_RATES,
): AmendmentTask[] {
  return Object.entries(hoursByCategory)
    .filter(([, hours]) => Number(hours) > 0)
    .map(([category, hours]) => {
      const rateKey = isFabrication(category) ? "fabrication" : category;
      const rate = Number(internalRates[rateKey] ?? 0);
      return {
        id: `${amendmentId}-${category}`,
        amendmentId,
        category: rateKey, // catégorie Gantt — "fabrication" pour toutes les sous-catégories
        subcategory: category, // détail conservé pour la vue projet / post-mortem
        hours: Number(hours),
        cost: round2(Number(hours) * rate),
      };
    });
}

export interface AmendmentInvoiceRequest {
  id: string;
  label: string;
  amount: number;
  invoice: null;
  status: "pending";
}

/**
 * Demande de facturation pour un avenant — confirmé le 9 août 2026 : même
 * mécanisme que les extras d'installation (voir billing.ts) plutôt qu'un
 * nouveau système. Direction demande, Administration traite — même flux
 * que les jalons standards. Même forme que les entrées de
 * `computeBillingPlan` pour rester compatible avec le reste du module de
 * facturation.
 */
export function amendmentInvoiceRequest(amendmentId: string, calc: AmendmentCalcResult): AmendmentInvoiceRequest {
  return {
    id: `${amendmentId}-invoice`,
    label: `Avenant ${amendmentId}`,
    amount: calc.sale,
    invoice: null,
    status: "pending",
  };
}
