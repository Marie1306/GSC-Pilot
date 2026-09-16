/**
 * GSC Pilot — SEAO (nouveau module, 16 septembre 2026)
 *
 * Bordereau de soumission : chaque ligne a son PROPRE coût et sa PROPRE
 * marge (contrairement à Vente externe, qui a une marge globale unique pour
 * toute la vente) — réutilise saleFromCost (margin.ts, jamais réimplémentée)
 * pour rester cohérent avec le Budgétaire/l'Avenant/les pièces d'appel de
 * service/la Vente externe — une seule formule de marge dans tout le projet.
 */
import { saleFromCost } from "./margin.js";

function round2(value: number): number {
  return Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100;
}

/** Prix de vente d'une ligne de bordereau — recalculé et stocké à chaque écriture serveur (jamais fourni par le client, voir seao/service.ts). */
export function seaoBordereauLineSalePrice(cost: number, marginPct: number): number {
  return saleFromCost(round2(Number(cost || 0)), marginPct);
}

/** Somme des prix de vente déjà calculés — utilisée pour Project.sold à la conversion (convertSeaoFileToProject). */
export function seaoBordereauTotal(salePrices: number[]): number {
  return round2(salePrices.reduce((sum, price) => sum + Number(price || 0), 0));
}
