/**
 * GSC Pilot — Vente externe (nouveau module, 8 septembre 2026)
 *
 * Vendre des pièces sans passer par le cycle Projet complet (pas d'heures,
 * pas de fabrication à suivre). Réutilise saleFromCost (margin.ts, jamais
 * réimplémentée) pour rester cohérent avec le Budgétaire/l'Avenant/les
 * pièces d'appel de service — une seule formule de marge dans tout le
 * projet.
 *
 * Marge globale UNIQUE pour toute la vente (pas par ligne, confirmé
 * explicitement par l'utilisatrice) : Frais de transport + Frais
 * administratifs (montants fixes en $, jamais convertis en demande d'achat)
 * s'additionnent au coût des pièces AVANT l'application de la marge.
 */
import { saleFromCost } from "./margin.js";

function round2(value: number): number {
  return Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100;
}

/**
 * Sous-total d'une ligne de pièce — arrondi PAR LIGNE (pas seulement au
 * total) pour que partsBaseCost affiché corresponde exactement à la somme
 * des PurchaseRequest.amount réellement créées, chacune arrondie
 * individuellement (une par ligne, voir externalSales/service.ts).
 */
export function externalSaleLineAmount(qty: number, unitCost: number): number {
  return round2(Number(qty || 0) * Number(unitCost || 0));
}

export interface ExternalSaleTotals {
  partsBaseCost: number;
  baseCostBeforeMargin: number;
  salePrice: number;
}

/** lineAmounts : sorties de externalSaleLineAmount, déjà arrondies par ligne. */
export function externalSaleTotals(lineAmounts: number[], transportFee: number, adminFee: number, marginPct: number): ExternalSaleTotals {
  const partsBaseCost = round2(lineAmounts.reduce((sum, amount) => sum + Number(amount || 0), 0));
  const baseCostBeforeMargin = round2(partsBaseCost + Number(transportFee || 0) + Number(adminFee || 0));
  return { partsBaseCost, baseCostBeforeMargin, salePrice: saleFromCost(baseCostBeforeMargin, marginPct) };
}
