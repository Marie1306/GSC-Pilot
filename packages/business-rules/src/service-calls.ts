/**
 * GSC Pilot — Appels de service (totaux financiers)
 *
 * Coût de la main-d'œuvre = TimeEntry.costRate (coût réel, gelé au punch —
 * voir modules/timeEntries, apps/api). Prix de vente de la main-d'œuvre =
 * tarif de la classe facturable choisie au punch (TimeEntry.techLevelId/
 * rateType, jamais un coût) — les deux sont volontairement DEUX totaux
 * distincts, jamais mélangés (confirmé : « Direction, Administration et
 * Propriétaire voient tous les prix/coûts internes », spécification,
 * section Permissions — Appels de service).
 *
 * Pièces : coût réel saisi par Direction après coup (0$ jusque-là — voir
 * spécification, Rapports), prix de vente = saleFromCost (margin.ts,
 * jamais réimplémenté ici).
 *
 * Frais de déplacement/repas : taux définis en Paramètres
 * (Settings.mileageRate/breakfastRate/lunchRate/dinnerRate).
 *
 * Nouveau fichier — aucun équivalent dans docs/handoff/03-modules-v01/.
 */

function round2(value: number): number {
  return Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100;
}

export type ServiceRateType = "regular" | "overtime" | "extra";

export interface TechLevelRatesLike {
  regularRate: number;
  overtimeRate: number;
  extraRate: number;
}

/** Tarif facturé au client pour cette classe/ce type de temps — jamais un coût. */
export function rateForType(techLevel: TechLevelRatesLike, rateType: ServiceRateType): number {
  if (rateType === "overtime") return Number(techLevel.overtimeRate);
  if (rateType === "extra") return Number(techLevel.extraRate);
  return Number(techLevel.regularRate);
}

export interface ServiceCallTimeEntryLike {
  status: string;
  roundedMinutes?: number | null;
  costRate?: number;
  techLevelId?: string | null;
  rateType?: string | null;
  // Tarif fixe de la tâche punchable (PunchableTask.specificServiceRate),
  // confirmé le 20 août 2026 — remplace le taux de la classe pour cette
  // entrée quand renseigné. Coût réel (ci-dessus) n'est jamais affecté :
  // seul le prix facturé au client change.
  specificRate?: number | null;
}

export interface ServiceCallLaborTotals {
  hours: number;
  cost: number;
  sale: number;
}

/** Seuls les punchs approuvés comptent — même principe que actualHoursByCategory (project-actuals.ts). */
export function serviceCallLaborTotals(
  entries: ServiceCallTimeEntryLike[] | undefined,
  techLevelsById: Record<string, TechLevelRatesLike>,
): ServiceCallLaborTotals {
  let hours = 0;
  let cost = 0;
  let sale = 0;
  for (const entry of entries || []) {
    if (entry.status !== "approved") continue;
    const entryHours = Number(entry.roundedMinutes || 0) / 60;
    hours += entryHours;
    cost += entryHours * Number(entry.costRate || 0);
    if (entry.specificRate !== null && entry.specificRate !== undefined) {
      sale += entryHours * entry.specificRate;
    } else {
      const techLevel = entry.techLevelId ? techLevelsById[entry.techLevelId] : undefined;
      if (techLevel && (entry.rateType === "regular" || entry.rateType === "overtime" || entry.rateType === "extra")) {
        sale += entryHours * rateForType(techLevel, entry.rateType);
      }
    }
  }
  return { hours: round2(hours), cost: round2(cost), sale: round2(sale) };
}

export type MealType = "breakfast" | "lunch" | "dinner";

export interface ServiceCallExpenseRates {
  mileageRate: number;
  breakfastRate: number;
  lunchRate: number;
  dinnerRate: number;
}

export interface ServiceCallMealCounts {
  mealsBreakfastCount: number;
  mealsLunchCount: number;
  mealsDinnerCount: number;
}

/**
 * Frais de déplacement (km × taux) + repas réclamés (tarif du type × nombre
 * réclamé). Jusqu'au 16 novembre 2026, un repas comptait pour un montant
 * fixe par type coché, jamais multiplié par une quantité — changé puisqu'un
 * Bon de travail peut désormais avoir plusieurs techniciens, chacun pouvant
 * réclamer son propre repas (confirmé par l'utilisatrice, exemple chiffré à
 * l'appui — voir CLAUDE.md).
 */
export function serviceCallExpenseTotal(kmTraveled: number | null | undefined, meals: ServiceCallMealCounts, rates: ServiceCallExpenseRates): number {
  const kmCost = Number(kmTraveled || 0) * Number(rates.mileageRate || 0);
  const mealsCost =
    Number(meals.mealsBreakfastCount || 0) * Number(rates.breakfastRate || 0) +
    Number(meals.mealsLunchCount || 0) * Number(rates.lunchRate || 0) +
    Number(meals.mealsDinnerCount || 0) * Number(rates.dinnerRate || 0);
  return round2(kmCost + mealsCost);
}
