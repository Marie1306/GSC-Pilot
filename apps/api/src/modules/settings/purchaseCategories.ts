/**
 * Paramètres — catégories d'achat (confirmé le 12 août 2026). Utilisées
 * par la demande d'achat régulière (pas la liste rapide de projet, qui n'a
 * délibérément aucune catégorie — voir modules/purchases). Même patron que
 * les tâches punchables par catégorie : Direction seulement, "supprimer"
 * = désactiver plutôt qu'effacer, pour ne jamais briser une demande déjà
 * faite qui référence la catégorie.
 */
import { prisma } from "../../db.js";
import { HttpError } from "../../middleware/errorHandler.js";
import type { PurchaseCategory } from "../../generated/prisma/client.js";

export interface PurchaseCategoryDto {
  id: string;
  name: string;
  thresholdAmount: number;
  active: boolean;
  sortOrder: number;
}

function toDto(row: PurchaseCategory): PurchaseCategoryDto {
  return { id: row.id, name: row.name, thresholdAmount: Number(row.thresholdAmount), active: row.active, sortOrder: row.sortOrder };
}

export async function listPurchaseCategories(): Promise<PurchaseCategoryDto[]> {
  const rows = await prisma.purchaseCategory.findMany({ orderBy: { sortOrder: "asc" } });
  return rows.map(toDto);
}

export async function createPurchaseCategory(name: string, thresholdAmount: number): Promise<PurchaseCategoryDto> {
  const existing = await prisma.purchaseCategory.findUnique({ where: { name } });
  if (existing) throw new HttpError(409, "Une catégorie porte déjà ce nom.");
  const count = await prisma.purchaseCategory.count();
  const row = await prisma.purchaseCategory.create({ data: { name, thresholdAmount, sortOrder: count } });
  return toDto(row);
}

export interface PurchaseCategoryUpdate {
  name?: string;
  thresholdAmount?: number;
  active?: boolean;
}

/**
 * Modifier le nom/seuil/statut actif. Ne touche jamais aux demandes déjà
 * soumises : leur seuil reste celui gelé sur la demande elle-même
 * (PurchaseRequest.thresholdAmountAtSubmission), jamais recalculé ici.
 */
export async function updatePurchaseCategory(id: string, update: PurchaseCategoryUpdate): Promise<PurchaseCategoryDto> {
  const existing = await prisma.purchaseCategory.findUnique({ where: { id } });
  if (!existing) throw new HttpError(404, "Catégorie introuvable.");
  if (update.name && update.name !== existing.name) {
    const nameTaken = await prisma.purchaseCategory.findUnique({ where: { name: update.name } });
    if (nameTaken) throw new HttpError(409, "Une catégorie porte déjà ce nom.");
  }
  const row = await prisma.purchaseCategory.update({ where: { id }, data: update });
  return toDto(row);
}
