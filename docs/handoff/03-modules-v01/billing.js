/**
 * GSC Pilot v01 — Facturation
 *
 * Confirmé le 8-9 août 2026. Rappel important : ce module ne génère PAS de
 * factures — Sage reste la source réelle. Ici, on calcule le PLAN (combien
 * facturer, quand) et le STATUT (à partir des dates/paiements déjà
 * enregistrés) — le suivi manuel lui-même reste un geste humain, par choix
 * (voir la spécification : « pour éviter d'alourdir l'application »).
 */

function round2(value) {
  return Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100;
}

/** Répartition par défaut : 25 % signature / 25 % après conception / 40 % à la livraison / 10 % 30 jours après. */
export const DEFAULT_BILLING_SPLIT = Object.freeze([
  { label: "Signature du contrat", pct: 25 },
  { label: "Après conception", pct: 25 },
  { label: "Livraison", pct: 40 },
  { label: "30 jours après livraison", pct: 10 },
]);

/**
 * Calcule le plan de facturation en dollars à partir du prix vendu.
 * Modifiable par projet (override) — confirmé, la répartition n'est pas figée.
 */
export function computeBillingPlan(soldPrice, split = DEFAULT_BILLING_SPLIT) {
  const totalPct = split.reduce((sum, step) => sum + Number(step.pct || 0), 0);
  if (Math.round(totalPct) !== 100) {
    throw new Error(`Le plan de facturation doit totaliser 100 % (obtenu ${totalPct}%).`);
  }
  return split.map((step) => ({
    label: step.label,
    pct: step.pct,
    amount: round2((Number(soldPrice || 0) * step.pct) / 100),
    invoice: null, // lien vers la facture une fois demandée/traitée — jamais recalculé après coup
    status: "pending",
  }));
}

/**
 * Statut d'une facture — reprend exactement la logique active de la v19
 * (v14r1InvoiceStatus) : payée si le solde est nul, en suspens si marquée
 * comme telle, en retard si l'échéance est dépassée, sinon envoyée.
 */
export function invoiceStatus(invoice, today = new Date()) {
  const balance = Number(invoice.amount || 0) - Number(invoice.paid || 0);
  if (invoice.status === "paid" || balance <= 0.005) return "paid";
  if (invoice.status === "on_hold") return "on_hold";
  const todayKey = today.toISOString().slice(0, 10);
  if (invoice.due && String(invoice.due).slice(0, 10) < todayKey) return "overdue";
  return "sent";
}

/**
 * Extras hors cycle standard — confirmé et approuvé le 8 août 2026.
 * Quand les heures Installation réellement punchées dépassent les heures
 * planifiées du budgétaire, une facture supplémentaire peut être demandée
 * pour l'écart, au taux d'installation du budgétaire. Réutilise le même
 * mécanisme demande/traitement que les 4 jalons standards — voir roles.js
 * (canRequestInvoice / canCreateInvoiceRecord).
 */
export function installationOverage(plannedHours, actualHours, installationRate) {
  const overageHours = round2(Math.max(0, Number(actualHours || 0) - Number(plannedHours || 0)));
  if (overageHours <= 0) return null;
  return {
    label: "Extra — heures d'installation supplémentaires",
    hours: overageHours,
    amount: round2(overageHours * Number(installationRate || 0)),
    invoice: null,
    status: "pending",
  };
}
