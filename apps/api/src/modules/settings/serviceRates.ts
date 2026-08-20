/**
 * Paramètres — tarifs de calls de service et pièces (complète TechLevelsCard,
 * qui ne couvre que la matrice Régulier/Temps sup./Extra par classe).
 * Direction seulement. mileageRate/breakfastRate/lunchRate/dinnerRate/
 * servicePartsDefaultMarginPct sont déjà lus par serviceCallExpenseTotal/
 * saleFromCost (service-calls.ts, margin.ts) — cette carte leur donne
 * enfin une interface. urgencyFee est nouveau (confirmé le 20 août 2026) :
 * seule la valeur du taux est stockée, jamais automatiquement appliquée —
 * voir le commentaire sur Settings.urgencyFee (schema.prisma).
 */
import { prisma } from "../../db.js";
import { HttpError } from "../../middleware/errorHandler.js";

export interface ServiceRatesDto {
  mileageRate: number;
  breakfastRate: number;
  lunchRate: number;
  dinnerRate: number;
  servicePartsDefaultMarginPct: number;
  urgencyFee: number;
}

async function requireSettings() {
  const settings = await prisma.settings.findFirst();
  if (!settings) throw new HttpError(500, "Paramètres non initialisés — lancer le seed.");
  return settings;
}

export async function getServiceRates(): Promise<ServiceRatesDto> {
  const settings = await requireSettings();
  return {
    mileageRate: Number(settings.mileageRate),
    breakfastRate: Number(settings.breakfastRate),
    lunchRate: Number(settings.lunchRate),
    dinnerRate: Number(settings.dinnerRate),
    servicePartsDefaultMarginPct: Number(settings.servicePartsDefaultMarginPct),
    urgencyFee: Number(settings.urgencyFee),
  };
}

export async function updateServiceRates(update: Partial<ServiceRatesDto>): Promise<ServiceRatesDto> {
  const settings = await requireSettings();
  const updated = await prisma.settings.update({ where: { id: settings.id }, data: update });
  return {
    mileageRate: Number(updated.mileageRate),
    breakfastRate: Number(updated.breakfastRate),
    lunchRate: Number(updated.lunchRate),
    dinnerRate: Number(updated.dinnerRate),
    servicePartsDefaultMarginPct: Number(updated.servicePartsDefaultMarginPct),
    urgencyFee: Number(updated.urgencyFee),
  };
}
