/**
 * Paramètres — seuils du voyant de marge réelle (confirmé le 17 août
 * 2026). Direction seulement, comme le reste de ce module. S'appliquent à
 * projets, roulements et calls — recalculés à la lecture partout où le
 * voyant s'affiche (financialStatus, packages/business-rules/margin.ts),
 * jamais stockés ailleurs que sur ce singleton.
 */
import { prisma } from "../../db.js";
import { HttpError } from "../../middleware/errorHandler.js";

export interface MarginThresholdsDto {
  conformeThreshold: number;
  atRiskThreshold: number;
}

export async function getMarginThresholds(): Promise<MarginThresholdsDto> {
  const settings = await prisma.settings.findFirst();
  if (!settings) throw new HttpError(500, "Paramètres non initialisés — lancer le seed.");
  return { conformeThreshold: Number(settings.marginConformeThreshold), atRiskThreshold: Number(settings.marginAtRiskThreshold) };
}

export async function updateMarginThresholds(update: MarginThresholdsDto): Promise<MarginThresholdsDto> {
  const settings = await prisma.settings.findFirst();
  if (!settings) throw new HttpError(500, "Paramètres non initialisés — lancer le seed.");
  const updated = await prisma.settings.update({
    where: { id: settings.id },
    data: { marginConformeThreshold: update.conformeThreshold, marginAtRiskThreshold: update.atRiskThreshold },
  });
  return { conformeThreshold: Number(updated.marginConformeThreshold), atRiskThreshold: Number(updated.marginAtRiskThreshold) };
}
