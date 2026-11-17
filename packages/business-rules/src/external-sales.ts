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

export interface ExternalSaleInvoiceLineInput {
  description: string;
  qty: number;
  unitCost: number;
}

export interface ExternalSaleInvoiceLine {
  description: string;
  quantity: number;
  unitPrice: number;
  amount: number;
}

/**
 * Lignes de Facture pour une Vente externe (17 novembre 2026, demande
 * explicite de l'utilisatrice) — dérivées automatiquement, jamais une 2e
 * source de vérité pour le prix total : saleFromCost(x,m) = x/(1-m/100) est
 * LINÉAIRE (saleFromCost(a+b,m) = saleFromCost(a,m)+saleFromCost(b,m)), donc
 * appliquer la marge séparément par pièce/transport/frais administratifs
 * puis les additionner redonne exactement le même total que
 * externalSaleTotals ci-dessus (à l'arrondi par ligne près — même limite
 * acceptée qu'ailleurs, ex. ventilation Confirmation de commande d'une
 * Facture de Projet).
 *
 * Les frais administratifs ne sont JAMAIS leur propre ligne — confirmé
 * explicitement par l'utilisatrice que le calcul total (externalSaleTotals)
 * doit rester intact, donc les frais SONT majorés par la marge comme
 * aujourd'hui : leur montant majoré se répartit au prorata des UNITÉS
 * vendues (qté totale de toutes les lignes de pièces, jamais par ligne —
 * pour que montant d'une ligne = prix unitaire affiché × sa quantité reste
 * vrai même si une ligne a plus d'une unité) et s'ajoute au prix unitaire de
 * chaque ligne de pièce. Le transport garde toujours sa propre ligne.
 */
export function externalSaleInvoiceLines(
  lines: ExternalSaleInvoiceLineInput[],
  transportFee: number,
  adminFee: number,
  marginPct: number,
): ExternalSaleInvoiceLine[] {
  const totalQty = lines.reduce((sum, line) => sum + Number(line.qty || 0), 0);
  const adminFeeWithMargin = Number(adminFee || 0) > 0 ? saleFromCost(Number(adminFee), marginPct) : 0;
  const feePerUnit = totalQty > 0 ? adminFeeWithMargin / totalQty : 0;

  // Arrondi au niveau du PRIX UNITAIRE (pas du montant de la ligne), pour que
  // l'identité affichée "prix unitaire × qté = montant" soit toujours exacte
  // (confirmé explicitement par l'utilisatrice) — le montant de chaque ligne
  // est ensuite DÉRIVÉ du prix unitaire déjà arrondi, jamais l'inverse. La
  // somme de toutes les lignes peut dévier de quelques cents du total gelé
  // (externalSaleTotals) à cause de cet arrondi par ligne — même limite déjà
  // acceptée pour la ventilation Confirmation de commande d'une Facture de
  // Projet, jamais un nouveau risque.
  const result: ExternalSaleInvoiceLine[] = lines.map((line) => {
    const qty = Number(line.qty || 0);
    const unitPrice = round2(saleFromCost(Number(line.unitCost || 0), marginPct) + feePerUnit);
    return { description: line.description, quantity: qty, unitPrice, amount: round2(unitPrice * qty) };
  });

  if (Number(transportFee || 0) > 0) {
    const unitPrice = saleFromCost(Number(transportFee), marginPct);
    result.push({ description: "Transport", quantity: 1, unitPrice, amount: unitPrice });
  }

  return result;
}
