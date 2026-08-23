/**
 * GSC Pilot — Délégation d'approbation (23 août 2026)
 *
 * Portée descoped du 20 août 2026 (SettingsPage.tsx), maintenant construite.
 * La logique de vérification (delegationActive/actsAsDirection) est déjà
 * écrite et branchée partout dans roles.ts depuis le port initial — ce
 * fichier n'ajoute que la gestion (créer/révoquer/lister) des
 * DelegationGrant réels, rien à ajouter côté permissions.
 *
 * Règles confirmées (roles.ts, section « Délégation d'approbation ») :
 * Direction seulement peut créer/révoquer ; délégué toujours Propriétaire
 * ou Administration (jamais Employé/Magasinier) ; catégories = sous-
 * ensemble de hours/purchases/service/changes ; justification obligatoire.
 * Une seule délégation active/à venir à la fois — une nouvelle création
 * est refusée tant qu'une délégation non révoquée n'est pas déjà expirée,
 * pour éviter l'ambiguïté (loadDelegationSettings ne charge jamais qu'une
 * seule délégation à la fois).
 */
import { DELEGATION_CATEGORIES, ROLES, type DelegationCategory } from "@gsc-pilot/business-rules";
import { prisma } from "../../db.js";
import { HttpError } from "../../middleware/errorHandler.js";

export interface DelegationDto {
  id: string;
  delegateId: string;
  delegateName: string;
  grantedById: string;
  grantedByName: string;
  categories: DelegationCategory[];
  monetaryLimit: number | null;
  startDate: string;
  endDate: string;
  justification: string;
  revokedAt: string | null;
  createdAt: string;
}

async function resolveNames(ids: string[]): Promise<Map<string, string>> {
  const rows = await prisma.employee.findMany({ where: { id: { in: [...new Set(ids)] } }, select: { id: true, name: true } });
  return new Map(rows.map((r) => [r.id, r.name]));
}

function toDto(
  row: {
    id: string;
    delegateId: string;
    grantedById: string;
    categories: string[];
    monetaryLimit: unknown;
    startDate: Date;
    endDate: Date;
    justification: string;
    revokedAt: Date | null;
    createdAt: Date;
  },
  nameById: Map<string, string>,
): DelegationDto {
  return {
    id: row.id,
    delegateId: row.delegateId,
    delegateName: nameById.get(row.delegateId) ?? "?",
    grantedById: row.grantedById,
    grantedByName: nameById.get(row.grantedById) ?? "?",
    categories: row.categories as DelegationCategory[],
    monetaryLimit: row.monetaryLimit !== null ? Number(row.monetaryLimit) : null,
    startDate: row.startDate.toISOString().slice(0, 10),
    endDate: row.endDate.toISOString().slice(0, 10),
    justification: row.justification,
    revokedAt: row.revokedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
  };
}

export async function listDelegations(): Promise<DelegationDto[]> {
  const rows = await prisma.delegationGrant.findMany({ orderBy: { createdAt: "desc" } });
  const nameById = await resolveNames([...rows.map((r) => r.delegateId), ...rows.map((r) => r.grantedById)]);
  return rows.map((row) => toDto(row, nameById));
}

export interface CreateDelegationInput {
  delegateId: string;
  categories: DelegationCategory[];
  monetaryLimit?: number;
  startDate: string;
  endDate: string;
  justification: string;
}

export async function createDelegation(grantedById: string, input: CreateDelegationInput): Promise<DelegationDto> {
  const delegate = await prisma.employee.findUnique({ where: { id: input.delegateId } });
  if (!delegate) throw new HttpError(404, "Employé introuvable.");
  if (![ROLES.BOSS, ROLES.ADMIN].includes(delegate.persona as typeof ROLES.BOSS | typeof ROLES.ADMIN)) {
    throw new HttpError(400, "La délégation ne peut être confiée qu'à l'Administration ou au Propriétaire.");
  }
  if (!delegate.active) throw new HttpError(400, "Cet employé est désactivé.");
  if (input.categories.length === 0) throw new HttpError(400, "Choisissez au moins une catégorie.");
  if (!input.categories.every((c) => (DELEGATION_CATEGORIES as readonly string[]).includes(c))) {
    throw new HttpError(400, "Catégorie de délégation invalide.");
  }
  if (!input.justification.trim()) throw new HttpError(400, "La justification est requise.");
  const startDate = new Date(`${input.startDate}T00:00:00`);
  const endDate = new Date(`${input.endDate}T00:00:00`);
  if (endDate < startDate) throw new HttpError(400, "La date de fin doit suivre la date de début.");

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const stillRelevant = await prisma.delegationGrant.findFirst({ where: { revokedAt: null, endDate: { gte: today } } });
  if (stillRelevant) {
    throw new HttpError(409, "Une délégation est déjà active ou à venir — révoquez-la d'abord si vous voulez la remplacer.");
  }

  const row = await prisma.delegationGrant.create({
    data: {
      delegateId: input.delegateId,
      grantedById,
      categories: input.categories,
      monetaryLimit: input.monetaryLimit ?? null,
      startDate,
      endDate,
      justification: input.justification.trim(),
    },
  });
  const nameById = await resolveNames([row.delegateId, row.grantedById]);
  return toDto(row, nameById);
}

export async function revokeDelegation(id: string): Promise<void> {
  const row = await prisma.delegationGrant.findUnique({ where: { id } });
  if (!row) throw new HttpError(404, "Délégation introuvable.");
  if (row.revokedAt) return;
  await prisma.delegationGrant.update({ where: { id }, data: { revokedAt: new Date() } });
}
