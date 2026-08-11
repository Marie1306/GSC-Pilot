/**
 * GSC Pilot — Back-up d'heures
 *
 * Règle confirmée (Fabrication + Programmation + Assemblage/tests seulement,
 * Conception et Installation exclues) : UNE seule définition, dans UN seul
 * fichier. Rien d'autre dans le projet ne recalcule ceci autrement.
 *
 * Pourquoi ce fichier existe séparément : dans le prototype v19, cette même
 * règle était implémentée à 5 endroits différents dans un seul fichier de
 * 20 700 lignes, dont 2 versions parties dans le mauvais sens (l'une incluait
 * Conception, l'autre excluait Assemblage/tests). Le projet AM Installation a
 * hérité de l'une des mauvaises versions, gelée pour toujours dans
 * project.backupHours — voir le rapport de vérification v19 pour le détail.
 * Une seule fonction exportée = une seule chose à corriger, un seul endroit
 * à tester.
 *
 * Confirmé (7 août 2026) : le back-up a aussi une valeur DE VENTE, distincte
 * du coût avant marge. Un niveau de complexité (0-10, voir COMPLEXITY_MARKUP_SCALE
 * dans margin.ts) détermine la marge appliquée. « La création d'un budgétaire
 * doit être fiable à 100 % pour déterminer le prix de vente d'un projet » —
 * donc ce module retourne baseCost (avant marge, à afficher tel quel dans la
 * vue projet) ET sale (après marge), jamais un seul des deux.
 *
 * Porté depuis docs/handoff/03-modules-v01/backup.js — typage ajouté
 * uniquement, aucune ligne de logique changée (voir CLAUDE.md).
 */
import { complexityMarkup, saleFromCost } from "./margin.js";

export const ELIGIBLE_BACKUP_CATEGORIES = Object.freeze(["fabrication", "programmation", "assemblage"] as const);
export const DEFAULT_BACKUP_RATE = 112;
export const DEFAULT_BACKUP_PCT = 10;

function round2(value: number): number {
  return Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100;
}

export interface BudgetRowLike {
  hours?: number;
}
export interface BudgetSectionLike {
  id: string;
  rows?: BudgetRowLike[];
}
export interface BudgetLike {
  sections?: BudgetSectionLike[];
  backupHourlyRate?: number;
  backupHoursPct?: number;
  backupHoursComplexity?: number;
}
export interface BackupSummary {
  hours: number;
  baseCost: number;
  sale: number;
  pct: number;
  complexity: number;
  margin: number;
  rate: number;
}
export interface ProjectLike {
  backupHours?: number;
  backupHoursCost?: number;
}

/** Heures admissibles au back-up dans les sections d'un budgétaire. */
export function eligibleHours(sections: BudgetSectionLike[] | undefined): number {
  return (sections || [])
    .filter((section) => (ELIGIBLE_BACKUP_CATEGORIES as readonly string[]).includes(section.id))
    .flatMap((section) => section.rows || [])
    .reduce((sum, row) => sum + Number(row.hours || 0), 0);
}

/**
 * Calcule le back-up d'un budgétaire. Le taux horaire se fige au premier
 * calcul (budget.backupHourlyRate) et n'est plus jamais recalculé
 * rétroactivement, même si le taux modèle change ensuite — ça préserve le
 * coût historique des anciens budgétaires/projets (règle confirmée : « Une
 * modification du taux ne s'applique qu'aux nouveaux Budgétaires »).
 */
export function backupSummary(budget: BudgetLike | null | undefined, modelRate: number = DEFAULT_BACKUP_RATE): BackupSummary {
  if (!budget || !budget.sections) {
    const margin = complexityMarkup(0);
    return { hours: 0, baseCost: 0, sale: 0, pct: DEFAULT_BACKUP_PCT, complexity: 0, margin, rate: modelRate };
  }
  if (!Number.isFinite(budget.backupHourlyRate)) {
    budget.backupHourlyRate = Number.isFinite(modelRate) ? modelRate : DEFAULT_BACKUP_RATE;
  }
  const pct = Math.max(0, Number(budget.backupHoursPct ?? DEFAULT_BACKUP_PCT));
  const complexity = Math.max(0, Math.min(10, Number(budget.backupHoursComplexity ?? 0)));
  const margin = complexityMarkup(complexity);
  const hours = round2((eligibleHours(budget.sections) * pct) / 100);
  const baseCost = round2(hours * (budget.backupHourlyRate as number)); // valeur avant marge — celle affichée dans la vue projet
  const sale = round2(saleFromCost(baseCost, margin)); // valeur de vente — affecte le prix de vente du projet
  return { hours, baseCost, sale, pct, complexity, margin, rate: budget.backupHourlyRate as number };
}

/**
 * Transfert vers un projet : copie les valeurs déjà calculées, ne recalcule
 * jamais (règle confirmée BKP-04). C'est la SEULE façon dont un projet doit
 * recevoir ses heures de back-up.
 */
export function transferBackupToProject(
  project: ProjectLike,
  budget: BudgetLike | null | undefined,
  modelRate: number = DEFAULT_BACKUP_RATE,
): ProjectLike {
  const backup = backupSummary(budget, modelRate);
  project.backupHours = backup.hours;
  project.backupHoursCost = backup.baseCost;
  return project;
}
