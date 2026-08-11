/**
 * Achats — module démarré le 12 août 2026 par la liste rapide de projet
 * (Propriétaire/Direction, voir canCreatePurchaseShortlist dans roles.ts).
 * Chaque ligne de la liste devient une demande d'achat (PurchaseRequest)
 * indépendante, SANS catégorie — c'est cette absence qui retire le seuil
 * de double autorisation du Propriétaire (roles.ts n'en trouve simplement
 * aucun à dépasser), pas une règle séparée ici.
 *
 * Total des achats d'un projet : volontairement PAS un champ maintenu sur
 * Project — calculé à la lecture en sommant les PurchaseRequest autorisées
 * + ProjectPurchaseEntry approuvées pour ce projet (même esprit que
 * internal-stats.ts, qui filtre et somme plutôt que de dupliquer un total).
 * Pas encore construit — cette vue de synthèse viendra avec l'écran projet.
 */
import { canSeeFinancialValues, type Persona } from "@gsc-pilot/business-rules";
import { prisma } from "../../db.js";
import { HttpError } from "../../middleware/errorHandler.js";
import type { PurchaseRequest, Employee } from "../../generated/prisma/client.js";

export interface ShortlistLineInput {
  description: string;
  supplier?: string;
  estimatedAmountMin?: number;
  estimatedAmountMax?: number;
}

export interface PurchaseRequestDto {
  id: string;
  displayId: string;
  requesterId: string;
  requesterName: string;
  projectId: string | null;
  projectLabel: string | null;
  supplier: string | null;
  description: string;
  amount?: number | null;
  estimatedAmountMin?: number | null;
  estimatedAmountMax?: number | null;
  hasCategory: boolean;
  status: string;
  requestedAt: string;
}

type PurchaseRequestWithRelations = PurchaseRequest & {
  requester: Pick<Employee, "name">;
  project: { projectNumber: string; name: string } | null;
};

const PENDING_STATUSES = ["owner_pending", "boss_pending"];

/**
 * Crée une liste rapide d'achats pour un projet — plusieurs lignes
 * indépendantes en une seule soumission (confirmé le 12 août 2026 :
 * approbation par ligne, pas par lot — pas de notion de "lot" à conserver
 * après la création, chaque ligne vit sa propre vie ensuite).
 */
export async function createPurchaseShortlist(
  projectId: string,
  requesterId: string,
  lines: ShortlistLineInput[],
): Promise<PurchaseRequest[]> {
  const project = await prisma.project.findUnique({ where: { id: projectId } });
  if (!project) throw new HttpError(404, "Projet introuvable.");
  if (lines.length === 0) throw new HttpError(400, "Au moins une ligne est requise.");
  for (const line of lines) {
    if (!line.description?.trim()) throw new HttpError(400, "Chaque ligne doit avoir une description.");
  }

  return prisma.$transaction(async (tx) => {
    const settings = await tx.settings.findFirst();
    if (!settings) throw new HttpError(500, "Paramètres non initialisés — lancer le seed.");
    let nextNumber = settings.nextPurchaseRequestNumber;
    const year = new Date().getFullYear();
    const created: PurchaseRequest[] = [];

    for (const line of lines) {
      const displayId = `DA-${year}-${String(nextNumber).padStart(4, "0")}`;
      nextNumber += 1;
      const row = await tx.purchaseRequest.create({
        data: {
          displayId,
          requesterId,
          projectType: "project",
          projectId,
          supplier: line.supplier?.trim() || null,
          description: line.description.trim(),
          estimatedAmountMin: line.estimatedAmountMin ?? null,
          estimatedAmountMax: line.estimatedAmountMax ?? null,
          status: "owner_pending",
        },
      });
      created.push(row);
    }

    await tx.settings.update({ where: { id: settings.id }, data: { nextPurchaseRequestNumber: nextNumber } });
    return created;
  });
}

export async function listPurchaseRequests(viewer: { id: string; persona: Persona }, status?: string): Promise<PurchaseRequestDto[]> {
  const canSeeAll = ["owner", "admin", "boss"].includes(viewer.persona);
  const rows = await prisma.purchaseRequest.findMany({
    where: {
      status: status ?? { in: PENDING_STATUSES },
      ...(canSeeAll ? {} : { requesterId: viewer.id }),
    },
    include: { requester: { select: { name: true } }, project: { select: { projectNumber: true, name: true } } },
    orderBy: { requestedAt: "desc" },
  });
  return rows.map((row) => toPurchaseRequestDto(row, viewer.persona));
}

export function toPurchaseRequestDto(row: PurchaseRequestWithRelations, viewerPersona: Persona): PurchaseRequestDto {
  const showFinancials = canSeeFinancialValues(viewerPersona);
  return {
    id: row.id,
    displayId: row.displayId,
    requesterId: row.requesterId,
    requesterName: row.requester.name,
    projectId: row.projectId,
    projectLabel: row.project ? `${row.project.projectNumber} — ${row.project.name}` : null,
    supplier: row.supplier,
    description: row.description,
    amount: showFinancials ? (row.amount === null ? null : Number(row.amount)) : undefined,
    estimatedAmountMin: showFinancials ? (row.estimatedAmountMin === null ? null : Number(row.estimatedAmountMin)) : undefined,
    estimatedAmountMax: showFinancials ? (row.estimatedAmountMax === null ? null : Number(row.estimatedAmountMax)) : undefined,
    hasCategory: row.categoryId !== null,
    status: row.status,
    requestedAt: row.requestedAt.toISOString(),
  };
}

/** Fixe/ajuste le prix final avant approbation — toujours possible tant que la ligne est encore en attente. */
export async function setPurchaseRequestAmount(id: string, amount: number): Promise<PurchaseRequest> {
  const request = await prisma.purchaseRequest.findUnique({ where: { id } });
  if (!request) throw new HttpError(404, "Demande d'achat introuvable.");
  if (!PENDING_STATUSES.includes(request.status)) {
    throw new HttpError(400, "Le prix ne peut être modifié qu'avant l'approbation.");
  }
  return prisma.purchaseRequest.update({ where: { id }, data: { amount } });
}

export async function approvePurchaseRequest(id: string, approvedById: string): Promise<PurchaseRequest> {
  const request = await prisma.purchaseRequest.findUnique({ where: { id } });
  if (!request) throw new HttpError(404, "Demande d'achat introuvable.");
  if (!PENDING_STATUSES.includes(request.status)) {
    throw new HttpError(400, "Cette demande n'est plus en attente.");
  }
  if (request.amount === null) {
    throw new HttpError(400, "Un prix doit être confirmé avant d'approuver.");
  }
  return prisma.purchaseRequest.update({
    where: { id },
    data: { status: "authorized", ownerApprovedById: approvedById, ownerApprovedAt: new Date() },
  });
}

export async function rejectPurchaseRequest(id: string, rejectedReason?: string): Promise<PurchaseRequest> {
  const request = await prisma.purchaseRequest.findUnique({ where: { id } });
  if (!request) throw new HttpError(404, "Demande d'achat introuvable.");
  if (!PENDING_STATUSES.includes(request.status)) {
    throw new HttpError(400, "Cette demande n'est plus en attente.");
  }
  // Rejet final, jamais de re-soumission (canResubmitRejectedPurchase dans roles.ts) — statut terminal.
  return prisma.purchaseRequest.update({ where: { id }, data: { status: "rejected", rejectedReason: rejectedReason ?? null } });
}
