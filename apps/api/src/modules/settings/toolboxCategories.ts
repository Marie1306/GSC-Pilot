/**
 * GSC Pilot — Boîte à outils : catégories (16 septembre 2026)
 *
 * Même patron CRUD que checklistCatalogs.ts (label unique, sortOrder,
 * "retirer" = désactiver jamais supprimer — les chartes/fils déjà liés à
 * une catégorie restent valides même si elle est désactivée depuis).
 * Vit dans settings/ comme checklistCatalogs.ts (regroupement par domaine de
 * logique), mais ses ROUTES ne sont PAS montées sous settingsRouter (voir
 * toolbox/routes.ts) : canAccessSettings est Direction seule, sans
 * exception, incompatible avec le trio Propriétaire/Direction/
 * Administration requis ici (canManageToolboxLibrary).
 */
import { prisma } from "../../db.js";
import { HttpError } from "../../middleware/errorHandler.js";
import type { ToolboxCategory } from "../../generated/prisma/client.js";

export interface ToolboxCategoryDto {
  id: string;
  label: string;
  active: boolean;
  sortOrder: number;
}

function toDto(row: ToolboxCategory): ToolboxCategoryDto {
  return { id: row.id, label: row.label, active: row.active, sortOrder: row.sortOrder };
}

export async function listToolboxCategories(): Promise<ToolboxCategoryDto[]> {
  return (await prisma.toolboxCategory.findMany({ orderBy: { sortOrder: "asc" } })).map(toDto);
}

export async function createToolboxCategory(label: string, insertBeforeId?: string): Promise<ToolboxCategoryDto> {
  if (await prisma.toolboxCategory.findUnique({ where: { label } })) throw new HttpError(409, "Cette catégorie existe déjà.");
  return prisma.$transaction(async (tx) => {
    let sortOrder = await tx.toolboxCategory.count();
    if (insertBeforeId) {
      const anchor = await tx.toolboxCategory.findUnique({ where: { id: insertBeforeId } });
      if (!anchor) throw new HttpError(404, "Position introuvable.");
      sortOrder = anchor.sortOrder;
      await tx.toolboxCategory.updateMany({ where: { sortOrder: { gte: sortOrder } }, data: { sortOrder: { increment: 1 } } });
    }
    return toDto(await tx.toolboxCategory.create({ data: { label, sortOrder } }));
  });
}

export interface ToolboxCategoryUpdate {
  label?: string;
  active?: boolean;
}

export async function updateToolboxCategory(id: string, update: ToolboxCategoryUpdate): Promise<ToolboxCategoryDto> {
  const existing = await prisma.toolboxCategory.findUnique({ where: { id } });
  if (!existing) throw new HttpError(404, "Catégorie introuvable.");
  if (update.label && update.label !== existing.label && (await prisma.toolboxCategory.findUnique({ where: { label: update.label } }))) {
    throw new HttpError(409, "Cette catégorie existe déjà.");
  }
  return toDto(await prisma.toolboxCategory.update({ where: { id }, data: update }));
}
