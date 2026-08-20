/**
 * Paramètres — classes facturables en service (TechLevel), confirmé le
 * 18 août 2026. Même patron que les catégories d'achat (purchaseCategories.ts) :
 * Direction seulement, "supprimer" = désactiver, jamais une suppression
 * réelle — un call/punch déjà fait continue de référencer sa classe sans
 * problème. Trois taux distincts par classe (régulier/temps supplémentaire/
 * extra), choisis au punch selon le type de temps réel — voir
 * TimeEntry.techLevelId/rateType (modules/timeEntries).
 */
import { prisma } from "../../db.js";
import { HttpError } from "../../middleware/errorHandler.js";
import type { TechLevel } from "../../generated/prisma/client.js";

export interface TechLevelDto {
  id: string;
  label: string;
  regularRate: number;
  overtimeRate: number;
  extraRate: number;
  active: boolean;
  sortOrder: number;
}

function toDto(row: TechLevel): TechLevelDto {
  return {
    id: row.id,
    label: row.label,
    regularRate: Number(row.regularRate),
    overtimeRate: Number(row.overtimeRate),
    extraRate: Number(row.extraRate),
    active: row.active,
    sortOrder: row.sortOrder,
  };
}

export async function listTechLevels(): Promise<TechLevelDto[]> {
  const rows = await prisma.techLevel.findMany({ orderBy: { sortOrder: "asc" } });
  return rows.map(toDto);
}

export type TechLevelSummaryDto = Omit<TechLevelDto, "regularRate" | "overtimeRate" | "extraRate">;

/**
 * Retire les 3 taux $/h — utilisé quand GET /tech-levels sert à Employé/
 * Magasinier (voir routes.ts) : ils doivent voir le libellé de leurs
 * propres classes pour choisir au punch, jamais les taux (canSeeFinancialValues,
 * même principe transversal que partout ailleurs dans l'application).
 */
export function scrubTechLevelRates(techLevels: TechLevelDto[]): TechLevelSummaryDto[] {
  return techLevels.map(({ regularRate: _regularRate, overtimeRate: _overtimeRate, extraRate: _extraRate, ...rest }) => rest);
}

export interface CreateTechLevelInput {
  label: string;
  regularRate: number;
  overtimeRate: number;
  extraRate: number;
}

export async function createTechLevel(input: CreateTechLevelInput): Promise<TechLevelDto> {
  const existing = await prisma.techLevel.findFirst({ where: { label: input.label } });
  if (existing) throw new HttpError(409, "Une classe porte déjà ce nom.");
  const count = await prisma.techLevel.count();
  const row = await prisma.techLevel.create({ data: { ...input, sortOrder: count } });
  return toDto(row);
}

export interface UpdateTechLevelInput {
  label?: string;
  regularRate?: number;
  overtimeRate?: number;
  extraRate?: number;
  active?: boolean;
}

export async function updateTechLevel(id: string, update: UpdateTechLevelInput): Promise<TechLevelDto> {
  const existing = await prisma.techLevel.findUnique({ where: { id } });
  if (!existing) throw new HttpError(404, "Classe introuvable.");
  if (update.label && update.label !== existing.label) {
    const nameTaken = await prisma.techLevel.findFirst({ where: { label: update.label } });
    if (nameTaken) throw new HttpError(409, "Une classe porte déjà ce nom.");
  }
  const row = await prisma.techLevel.update({ where: { id }, data: update });
  return toDto(row);
}
