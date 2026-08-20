/**
 * Paramètres — canaux d'entrée des demandes clients (SalesChannel). Direction
 * seulement — ajouter/renommer/réordonner/désactiver/réactiver (confirmé,
 * spécification : « configurables/ajoutables par Direction seulement »,
 * section Rapports/Contacts/Tableau de bord/Demandes clients). Même patron
 * que les catégories d'achat : "désactiver" plutôt qu'effacer — une demande
 * déjà faite garde son canal (SalesChannel.clientRequests), jamais orpheline.
 */
import { prisma } from "../../db.js";
import { HttpError } from "../../middleware/errorHandler.js";
import type { SalesChannel } from "../../generated/prisma/client.js";

export interface SalesChannelDto {
  id: string;
  name: string;
  active: boolean;
  sortOrder: number;
}

function toDto(row: SalesChannel): SalesChannelDto {
  return { id: row.id, name: row.name, active: row.active, sortOrder: row.sortOrder };
}

export async function listSalesChannels(): Promise<SalesChannelDto[]> {
  const rows = await prisma.salesChannel.findMany({ orderBy: { sortOrder: "asc" } });
  return rows.map(toDto);
}

export async function createSalesChannel(name: string): Promise<SalesChannelDto> {
  const existing = await prisma.salesChannel.findUnique({ where: { name } });
  if (existing) throw new HttpError(409, "Un canal porte déjà ce nom.");
  const count = await prisma.salesChannel.count();
  const row = await prisma.salesChannel.create({ data: { name, sortOrder: count } });
  return toDto(row);
}

export interface SalesChannelUpdate {
  name?: string;
  active?: boolean;
}

export async function updateSalesChannel(id: string, update: SalesChannelUpdate): Promise<SalesChannelDto> {
  const existing = await prisma.salesChannel.findUnique({ where: { id } });
  if (!existing) throw new HttpError(404, "Canal introuvable.");
  if (update.name && update.name !== existing.name) {
    const nameTaken = await prisma.salesChannel.findUnique({ where: { name: update.name } });
    if (nameTaken) throw new HttpError(409, "Un canal porte déjà ce nom.");
  }
  const row = await prisma.salesChannel.update({ where: { id }, data: update });
  return toDto(row);
}

/** Échange le sortOrder avec le voisin immédiat (liste complète, actifs et désactivés confondus) — sans effet en bout de liste. */
export async function moveSalesChannel(id: string, direction: "up" | "down"): Promise<SalesChannelDto[]> {
  const all = await prisma.salesChannel.findMany({ orderBy: { sortOrder: "asc" } });
  const index = all.findIndex((row) => row.id === id);
  if (index === -1) throw new HttpError(404, "Canal introuvable.");
  const swapIndex = direction === "up" ? index - 1 : index + 1;

  if (swapIndex >= 0 && swapIndex < all.length) {
    const current = all[index]!;
    const swapWith = all[swapIndex]!;
    await prisma.$transaction([
      prisma.salesChannel.update({ where: { id: current.id }, data: { sortOrder: swapWith.sortOrder } }),
      prisma.salesChannel.update({ where: { id: swapWith.id }, data: { sortOrder: current.sortOrder } }),
    ]);
  }

  const updated = await prisma.salesChannel.findMany({ orderBy: { sortOrder: "asc" } });
  return updated.map(toDto);
}
