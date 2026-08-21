/**
 * GSC Pilot — Checklist de production : catalogues configurables
 * (épaisseurs, matériaux, étapes de fabrication), Paramètres Direction.
 * Même patron que purchaseCategories.ts : "supprimer" = désactiver, jamais
 * une vraie suppression (les items déjà créés gardent leur valeur choisie
 * en texte figé — voir ProductionChecklistItem — ou, pour les étapes, leur
 * relation ProductionChecklistItemStep reste valide même si l'étape est
 * désactivée depuis).
 */
import { prisma } from "../../db.js";
import { HttpError } from "../../middleware/errorHandler.js";
import type { ChecklistThickness, ChecklistMaterial, ChecklistStep } from "../../generated/prisma/client.js";

export interface ChecklistCatalogDto {
  id: string;
  label: string;
  active: boolean;
  sortOrder: number;
}

function toDto(row: ChecklistThickness | ChecklistMaterial | ChecklistStep): ChecklistCatalogDto {
  return { id: row.id, label: row.label, active: row.active, sortOrder: row.sortOrder };
}

export interface ChecklistCatalogUpdate {
  label?: string;
  active?: boolean;
}

// --- Épaisseurs ---
export async function listChecklistThicknesses(): Promise<ChecklistCatalogDto[]> {
  return (await prisma.checklistThickness.findMany({ orderBy: { sortOrder: "asc" } })).map(toDto);
}
export async function createChecklistThickness(label: string): Promise<ChecklistCatalogDto> {
  if (await prisma.checklistThickness.findUnique({ where: { label } })) throw new HttpError(409, "Cette épaisseur existe déjà.");
  const count = await prisma.checklistThickness.count();
  return toDto(await prisma.checklistThickness.create({ data: { label, sortOrder: count } }));
}
export async function updateChecklistThickness(id: string, update: ChecklistCatalogUpdate): Promise<ChecklistCatalogDto> {
  const existing = await prisma.checklistThickness.findUnique({ where: { id } });
  if (!existing) throw new HttpError(404, "Épaisseur introuvable.");
  if (update.label && update.label !== existing.label && (await prisma.checklistThickness.findUnique({ where: { label: update.label } }))) {
    throw new HttpError(409, "Cette épaisseur existe déjà.");
  }
  return toDto(await prisma.checklistThickness.update({ where: { id }, data: update }));
}

// --- Matériaux ---
export async function listChecklistMaterials(): Promise<ChecklistCatalogDto[]> {
  return (await prisma.checklistMaterial.findMany({ orderBy: { sortOrder: "asc" } })).map(toDto);
}
export async function createChecklistMaterial(label: string): Promise<ChecklistCatalogDto> {
  if (await prisma.checklistMaterial.findUnique({ where: { label } })) throw new HttpError(409, "Ce matériau existe déjà.");
  const count = await prisma.checklistMaterial.count();
  return toDto(await prisma.checklistMaterial.create({ data: { label, sortOrder: count } }));
}
export async function updateChecklistMaterial(id: string, update: ChecklistCatalogUpdate): Promise<ChecklistCatalogDto> {
  const existing = await prisma.checklistMaterial.findUnique({ where: { id } });
  if (!existing) throw new HttpError(404, "Matériau introuvable.");
  if (update.label && update.label !== existing.label && (await prisma.checklistMaterial.findUnique({ where: { label: update.label } }))) {
    throw new HttpError(409, "Ce matériau existe déjà.");
  }
  return toDto(await prisma.checklistMaterial.update({ where: { id }, data: update }));
}

// --- Étapes de fabrication ---
export async function listChecklistSteps(): Promise<ChecklistCatalogDto[]> {
  return (await prisma.checklistStep.findMany({ orderBy: { sortOrder: "asc" } })).map(toDto);
}
export async function createChecklistStep(label: string): Promise<ChecklistCatalogDto> {
  if (await prisma.checklistStep.findUnique({ where: { label } })) throw new HttpError(409, "Cette étape existe déjà.");
  const count = await prisma.checklistStep.count();
  return toDto(await prisma.checklistStep.create({ data: { label, sortOrder: count } }));
}
export async function updateChecklistStep(id: string, update: ChecklistCatalogUpdate): Promise<ChecklistCatalogDto> {
  const existing = await prisma.checklistStep.findUnique({ where: { id } });
  if (!existing) throw new HttpError(404, "Étape introuvable.");
  if (update.label && update.label !== existing.label && (await prisma.checklistStep.findUnique({ where: { label: update.label } }))) {
    throw new HttpError(409, "Cette étape existe déjà.");
  }
  return toDto(await prisma.checklistStep.update({ where: { id }, data: update }));
}
