/**
 * GSC Pilot — Sections du budgétaire (Conception/Fabrication/Programmation/
 * Assemblage/Installation)
 *
 * Référencé depuis margin.ts (« chaque section du budgétaire indépendamment »,
 * confirmé le 11 août 2026 — complexité PAR SECTION, pas un seul niveau
 * projet) mais jamais construit avant cette session. Même mécanisme que
 * backup.ts — complexityMarkup/saleFromCost de margin.ts, non modifiées —
 * sauf qu'ici TOUTES les sections comptent (contrairement au back-up, qui
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

export interface SectionRowLike {
  hourlyRate?: number;
  hours?: number;
}
export interface SectionLike {
  category: string;
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

/** Calcule heures/coût/prix de vente d'UNE section — complexité propre à cette section. */
export function sectionSummary(section: SectionLike): SectionSummary {
  const complexity = Math.max(0, Math.min(10, Number(section.complexity ?? 0)));
  const margin = complexityMarkup(complexity);
  const rows = section.rows || [];
  const hours = round2(rows.reduce((sum, row) => sum + Number(row.hours || 0), 0));
  const baseCost = round2(rows.reduce((sum, row) => sum + Number(row.hours || 0) * Number(row.hourlyRate || 0), 0));
  const sale = round2(saleFromCost(baseCost, margin));
  return { category: section.category, hours, baseCost, sale, complexity, margin };
}

export interface BudgetTotals {
  totalHours: number;
  totalBaseCost: number;
  totalSale: number;
}

/** Additionne les sections ET le back-up (même valeur avant marge/vente, un seul total). */
export function budgetTotals(sections: SectionSummary[], backup: { hours: number; baseCost: number; sale: number }): BudgetTotals {
  const all = [...sections, backup];
  return {
    totalHours: round2(all.reduce((sum, item) => sum + item.hours, 0)),
    totalBaseCost: round2(all.reduce((sum, item) => sum + item.baseCost, 0)),
    totalSale: round2(all.reduce((sum, item) => sum + item.sale, 0)),
  };
}
