/**
 * Paramètres — cycle de facturation par défaut des projets (Settings.
 * defaultBillingSplit). computeBillingPlan (billing.ts, jamais modifié)
 * accepte déjà une répartition en second argument — ce module lui fournit
 * enfin la valeur réelle au lieu du DEFAULT_BILLING_SPLIT toujours codé en
 * dur (écart trouvé le 20 août 2026 : le champ existait depuis la Phase 1
 * mais n'était jamais lu nulle part — voir projects/service.ts, maintenant
 * branché sur parseBillingSplit ci-dessous).
 */
import { DEFAULT_BILLING_SPLIT, type BillingSplitStep } from "@gsc-pilot/business-rules";
import { prisma } from "../../db.js";
import { HttpError } from "../../middleware/errorHandler.js";

function isValidSplit(value: unknown): value is BillingSplitStep[] {
  return (
    Array.isArray(value) &&
    value.length > 0 &&
    value.every((step) => step && typeof step === "object" && typeof (step as BillingSplitStep).label === "string" && typeof (step as BillingSplitStep).pct === "number")
  );
}

/** Toujours une répartition valide — retombe sur DEFAULT_BILLING_SPLIT si le champ est absent/corrompu, jamais une erreur bloquante à la conversion d'un projet. */
export function parseBillingSplit(value: unknown): BillingSplitStep[] {
  return isValidSplit(value) ? value : [...DEFAULT_BILLING_SPLIT];
}

export async function getBillingSplit(): Promise<BillingSplitStep[]> {
  const settings = await prisma.settings.findFirst();
  if (!settings) throw new HttpError(500, "Paramètres non initialisés — lancer le seed.");
  return parseBillingSplit(settings.defaultBillingSplit);
}

export async function updateBillingSplit(steps: BillingSplitStep[]): Promise<BillingSplitStep[]> {
  const total = steps.reduce((sum, step) => sum + Number(step.pct || 0), 0);
  if (Math.round(total) !== 100) throw new HttpError(400, `Le cycle doit totaliser exactement 100 % (obtenu ${total}%).`);
  const settings = await prisma.settings.findFirst();
  if (!settings) throw new HttpError(500, "Paramètres non initialisés — lancer le seed.");
  const updated = await prisma.settings.update({
    where: { id: settings.id },
    data: { defaultBillingSplit: JSON.parse(JSON.stringify(steps)) },
  });
  return parseBillingSplit(updated.defaultBillingSplit);
}
