/**
 * GSC Pilot — Sections du budgétaire (13 catégories réelles, vérifiées
 * directement dans le prototype v19 le 12 août 2026 — deux vérifications :
 * une première passe incomplète, corrigée après un retour de l'utilisatrice
 * qui a fourni des captures d'écran catégorie par catégorie).
 *
 * Deux types de section (kind) :
 * - "labor" : coût d'une ligne = heures × taux horaire. Les heures d'une
 *   ligne peuvent être saisies directement, OU dérivées automatiquement
 *   d'une autre ligne de la même section via autoFromRowId/autoPct (ex.
 *   « Conception plus 10 % » = heures de « Conception & Dessin » × 10 %,
 *   jamais saisie directement, non punchable).
 * - "purchase" : coût d'une ligne = quantité × prix unitaire.
 *
 * Référencé depuis margin.ts (« chaque section du budgétaire indépendamment »,
 * confirmé le 11 et reconfirmé le 12 août 2026 — complexité PAR SECTION, pas
 * par ligne ni pour tout le projet). Même mécanisme que backup.ts —
 * complexityMarkup/saleFromCost de margin.ts, non modifiées — sauf qu'ici
 * TOUTES les sections comptent (contrairement au back-up d'heures, qui
 * exclut Conception et Installation).
 *
 * Règle générale confirmée (7 août 2026, section « Back-up d'heures ») :
 * chaque catégorie du budgétaire affiche sa valeur avant marge dans la vue
 * projet; la complexité affecte seulement le prix de vente — donc, comme
 * backup.ts, ce module retourne baseCost ET sale, jamais un seul des deux.
 */
import { complexityMarkup, saleFromCost } from "./margin.js";

function round2(value: number): number {
  return Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100;
}

export type SectionKind = "labor" | "purchase";

export interface SectionRowLike {
  id?: string;
  hourlyRate?: number;
  hours?: number;
  qty?: number;
  unitPrice?: number;
  /** Référence l'id d'une autre ligne de la MÊME section — heures effectives = celle-ci × autoPct / 100, jamais saisies directement. */
  autoFromRowId?: string | null;
  /** Pourcentage entier (10 = 10 %), pas une fraction. */
  autoPct?: number | null;
}
export interface SectionLike {
  category: string;
  kind?: SectionKind;
  complexity?: number;
  rows?: SectionRowLike[];
}
export interface SectionSummary {
  category: string;
  hours: number;
  baseCost: number;
  sale: number;
  complexity: number;
  margin: number;
}

/** Heures effectives d'une ligne — dérivées d'une autre ligne de la section si autoFromRowId est défini. */
export function effectiveRowHours(row: SectionRowLike, rows: SectionRowLike[]): number {
  if (row.autoFromRowId) {
    const source = rows.find((candidate) => candidate.id === row.autoFromRowId);
    return round2(Number(source?.hours || 0) * (Number(row.autoPct || 0) / 100));
  }
  return round2(Number(row.hours || 0));
}

function rowBaseCost(row: SectionRowLike, kind: SectionKind, rows: SectionRowLike[]): number {
  if (kind === "purchase") {
    return Number(row.qty || 0) * Number(row.unitPrice || 0);
  }
  return effectiveRowHours(row, rows) * Number(row.hourlyRate || 0);
}

/** Calcule heures/coût/prix de vente d'UNE section — complexité propre à cette section. */
export function sectionSummary(section: SectionLike): SectionSummary {
  const complexity = Math.max(0, Math.min(10, Number(section.complexity ?? 0)));
  const margin = complexityMarkup(complexity);
  const rows = section.rows || [];
  const kind = section.kind ?? "labor";
  const hours = round2(kind === "labor" ? rows.reduce((sum, row) => sum + effectiveRowHours(row, rows), 0) : 0);
  const baseCost = round2(rows.reduce((sum, row) => sum + rowBaseCost(row, kind, rows), 0));
  const sale = round2(saleFromCost(baseCost, margin));
  return { category: section.category, hours, baseCost, sale, complexity, margin };
}

export interface ProjectBackupSummary {
  baseCost: number;
  sale: number;
  complexity: number;
  margin: number;
}

/**
 * Back-up PROJET — distinct du back-up D'HEURES de backup.ts (confirmé le
 * 12 août 2026, deux réserves séparées dans le même budgétaire). Ici le
 * montant est saisi à la main par Direction, jamais dérivé des heures — la
 * complexité détermine seulement la marge appliquée à ce montant, même
 * mécanisme que sectionSummary (complexityMarkup/saleFromCost de margin.ts,
 * non modifiées).
 */
export function projectBackupSummary(amount: number, complexity: number): ProjectBackupSummary {
  const c = Math.max(0, Math.min(10, Number(complexity ?? 0)));
  const margin = complexityMarkup(c);
  const baseCost = round2(Number(amount || 0));
  const sale = round2(saleFromCost(baseCost, margin));
  return { baseCost, sale, complexity: c, margin };
}

export interface BudgetTotals {
  totalHours: number;
  totalBaseCost: number;
  totalSale: number;
}

/** Additionne les sections, le back-up d'heures ET le back-up projet (un seul total). */
export function budgetTotals(
  sections: SectionSummary[],
  hoursBackup: { hours: number; baseCost: number; sale: number },
  projectBackup: { baseCost: number; sale: number },
): BudgetTotals {
  const totalHours = round2(sections.reduce((sum, item) => sum + item.hours, 0) + hoursBackup.hours);
  const totalBaseCost = round2(
    sections.reduce((sum, item) => sum + item.baseCost, 0) + hoursBackup.baseCost + projectBackup.baseCost,
  );
  const totalSale = round2(sections.reduce((sum, item) => sum + item.sale, 0) + hoursBackup.sale + projectBackup.sale);
  return { totalHours, totalBaseCost, totalSale };
}
