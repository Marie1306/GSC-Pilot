/**
 * Achats — module démarré le 12 août 2026 par la liste rapide de projet,
 * étendu le 13 août 2026 avec le formulaire général (avec catégorie),
 * ouvert à tous (voir canSubmitPurchaseRequest, roles.ts), plus un suivi de
 * commande après autorisation (en attente/commandé/reçu) et une étape
 * explicite d'application au projet.
 *
 * Total des achats d'un projet : volontairement PAS un champ maintenu sur
 * Project — calculé à la lecture en sommant les PurchaseRequest APPLIQUÉES
 * (appliedToProjectAt non nul, jamais simplement "authorized" depuis le 13
 * août 2026) + ProjectPurchaseEntry approuvées pour ce projet (même esprit
 * que internal-stats.ts, qui filtre et somme plutôt que de dupliquer un
 * total) — voir projectPurchasesActual ci-dessous, branché dans l'écran
 * projet (Projet 2A, 17 août 2026).
 *
 * PurchaseCategory.thresholdAmount est copié dans
 * PurchaseRequest.thresholdAmountAtSubmission au moment de la création
 * (createPurchaseRequest) — confirmé le 12 août 2026 : le seuil se fige à
 * la soumission, un changement de seuil ultérieur par Direction ne doit
 * jamais affecter une demande déjà en attente (voir assertCanActOnRequest
 * dans routes.ts, qui lit ce champ gelé plutôt que la catégorie en direct).
 */
import { canSeeFinancialValues, type Persona } from "@gsc-pilot/business-rules";
import { prisma } from "../../db.js";
import { HttpError } from "../../middleware/errorHandler.js";
import type { PurchaseRequest, Employee } from "../../generated/prisma/client.js";

export const FULFILLMENT_STATUSES = ["waiting", "ordered", "received"] as const;
export type FulfillmentStatus = (typeof FULFILLMENT_STATUSES)[number];

function round2(value: number): number {
  return Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100;
}

/**
 * Année d'affaires courante — heure de l'Est/Québec (America/Toronto),
 * PAS le fuseau du serveur (Render tourne probablement en UTC). Confirmé
 * le 14 août 2026 : la remise à zéro annuelle du numéro de demande doit se
 * produire à la vraie frontière du 31 décembre 23h59 heure du Québec, pas
 * à minuit UTC (qui tombe ~19-20h heure du Québec le 31 décembre selon
 * l'heure d'été/hiver — Intl.DateTimeFormat gère cette bascule tout seul,
 * jamais un décalage fixe codé en dur).
 */
function currentBusinessYear(): number {
  return Number(new Intl.DateTimeFormat("en-CA", { timeZone: "America/Toronto", year: "numeric" }).format(new Date()));
}

/**
 * Prochain numéro de demande d'achat (DA-AAAA-NNNNN, 5 chiffres depuis le
 * 14 août 2026 — auparavant 4) — remise à zéro automatique dès la
 * première demande d'une nouvelle année d'affaires, "règle du plus haut
 * +1" (déjà confirmée) conservée à l'intérieur d'une même année. Fonction
 * pure, testable sans base de données réelle — voir purchases côté appel
 * pour la lecture/écriture de Settings.
 */
export function resolveNextPurchaseRequestNumber(
  settings: { nextPurchaseRequestNumber: number; purchaseRequestNumberYear: number },
  year: number = currentBusinessYear(),
): { year: number; number: number } {
  const number = settings.purchaseRequestNumberYear === year ? settings.nextPurchaseRequestNumber : 1;
  return { year, number };
}

export function formatPurchaseRequestDisplayId(year: number, number: number): string {
  return `DA-${year}-${String(number).padStart(5, "0")}`;
}

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
  /** Toujours inclus (non financier) — permet à l'interface de rejouer EXACTEMENT canApprovePurchaseRequest (roles.ts) plutôt que d'approximer qui peut agir sur cette ligne. */
  requesterPersona: Persona;
  projectId: string | null;
  projectLabel: string | null;
  categoryName: string | null;
  supplier: string | null;
  description: string;
  amount?: number | null;
  estimatedAmountMin?: number | null;
  estimatedAmountMax?: number | null;
  /** Seuil gelé à la soumission — même visibilité que amount (canSeeFinancialValues). Nécessaire pour rejouer canApprovePurchaseRequest côté client. */
  thresholdAmountAtSubmission?: number | null;
  hasCategory: boolean;
  status: string;
  requestedAt: string;
  /** Modifiée par le demandeur depuis la soumission — sert de signal pour Direction (13 août 2026), voir schema.prisma. */
  editedAt: string | null;
  /** Suivi post-autorisation (waiting/ordered/received) — nul tant que pas encore autorisée. */
  fulfillmentStatus: string | null;
  appliedToProjectAt: string | null;
}

type PurchaseRequestWithRelations = PurchaseRequest & {
  requester: Pick<Employee, "name" | "persona">;
  project: { projectNumber: string; name: string } | null;
  category: { name: string } | null;
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
    const { year, number: startNumber } = resolveNextPurchaseRequestNumber(settings);
    let nextNumber = startNumber;
    const created: PurchaseRequest[] = [];

    for (const line of lines) {
      const displayId = formatPurchaseRequestDisplayId(year, nextNumber);
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

    await tx.settings.update({ where: { id: settings.id }, data: { nextPurchaseRequestNumber: nextNumber, purchaseRequestNumberYear: year } });
    return created;
  });
}

export interface CreatePurchaseRequestInput {
  projectType: "project" | "internal";
  projectId?: string;
  categoryId: string;
  description: string;
  supplier?: string;
  estimatedAmountMin?: number;
  estimatedAmountMax?: number;
}

/**
 * Formulaire général de demande d'achat — ouvert à tous (13 août 2026, voir
 * canSubmitPurchaseRequest). Contrairement à la liste rapide, TOUJOURS une
 * catégorie, dont le seuil se fige ici sur thresholdAmountAtSubmission
 * (jamais relu en direct plus tard, voir en-tête de fichier).
 *
 * "service" (appel de service) volontairement absent des projectType
 * acceptés ici : aucun mécanisme de création d'appel de service n'existe
 * encore pour choisir une valeur réelle — le champ reste supporté par le
 * schéma pour ce futur module, pas construit dans ce formulaire pour
 * l'instant plutôt que d'exposer un sélecteur toujours vide.
 */
export async function createPurchaseRequest(requesterId: string, input: CreatePurchaseRequestInput): Promise<PurchaseRequest> {
  if (!input.description?.trim()) throw new HttpError(400, "La description est requise.");
  const category = await prisma.purchaseCategory.findUnique({ where: { id: input.categoryId } });
  if (!category || !category.active) throw new HttpError(400, "Catégorie invalide.");
  if (input.projectType === "project") {
    if (!input.projectId) throw new HttpError(400, "Le projet est requis.");
    const project = await prisma.project.findUnique({ where: { id: input.projectId } });
    if (!project) throw new HttpError(404, "Projet introuvable.");
  }

  return prisma.$transaction(async (tx) => {
    const settings = await tx.settings.findFirst();
    if (!settings) throw new HttpError(500, "Paramètres non initialisés — lancer le seed.");
    const { year, number } = resolveNextPurchaseRequestNumber(settings);
    const displayId = formatPurchaseRequestDisplayId(year, number);
    const row = await tx.purchaseRequest.create({
      data: {
        displayId,
        requesterId,
        projectType: input.projectType,
        projectId: input.projectType === "project" ? input.projectId : null,
        categoryId: category.id,
        thresholdAmountAtSubmission: category.thresholdAmount,
        supplier: input.supplier?.trim() || null,
        description: input.description.trim(),
        estimatedAmountMin: input.estimatedAmountMin ?? null,
        estimatedAmountMax: input.estimatedAmountMax ?? null,
        status: "owner_pending",
      },
    });
    await tx.settings.update({ where: { id: settings.id }, data: { nextPurchaseRequestNumber: number + 1, purchaseRequestNumberYear: year } });
    return row;
  });
}

/** Visibilité : Direction/Administration/Propriétaire voient tout; chacun des autres rôles ne voit que ses propres demandes (canViewPurchase, roles.ts). Sans `status`, retourne TOUTES les demandes visibles (pas seulement en attente) — Propriétaire doit voir le statut de chacune, Employé/Magasinier le suivi de leurs propres demandes passées (13 août 2026). */
export async function listPurchaseRequests(viewer: { id: string; persona: Persona }, status?: string): Promise<PurchaseRequestDto[]> {
  const canSeeAll = ["owner", "admin", "boss"].includes(viewer.persona);
  const rows = await prisma.purchaseRequest.findMany({
    where: {
      ...(status ? { status } : {}),
      ...(canSeeAll ? {} : { requesterId: viewer.id }),
    },
    include: {
      requester: { select: { name: true, persona: true } },
      project: { select: { projectNumber: true, name: true } },
      category: { select: { name: true } },
    },
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
    requesterPersona: row.requester.persona as Persona,
    projectId: row.projectId,
    projectLabel: row.project ? `${row.project.projectNumber} — ${row.project.name}` : null,
    categoryName: row.category?.name ?? null,
    supplier: row.supplier,
    description: row.description,
    amount: showFinancials ? (row.amount === null ? null : Number(row.amount)) : undefined,
    estimatedAmountMin: showFinancials ? (row.estimatedAmountMin === null ? null : Number(row.estimatedAmountMin)) : undefined,
    estimatedAmountMax: showFinancials ? (row.estimatedAmountMax === null ? null : Number(row.estimatedAmountMax)) : undefined,
    thresholdAmountAtSubmission: showFinancials
      ? (row.thresholdAmountAtSubmission === null ? null : Number(row.thresholdAmountAtSubmission))
      : undefined,
    hasCategory: row.categoryId !== null,
    status: row.status,
    requestedAt: row.requestedAt.toISOString(),
    editedAt: row.editedAt?.toISOString() ?? null,
    fulfillmentStatus: row.fulfillmentStatus,
    appliedToProjectAt: row.appliedToProjectAt?.toISOString() ?? null,
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
    // fulfillmentStatus démarre à "waiting" automatiquement à l'autorisation
    // (13 août 2026) — Direction n'a pas de geste séparé pour "commencer"
    // le suivi, elle le fait seulement progresser ensuite.
    data: { status: "authorized", ownerApprovedById: approvedById, ownerApprovedAt: new Date(), fulfillmentStatus: "waiting" },
  });
}

export interface UpdatePurchaseRequestInput {
  description?: string;
  supplier?: string | null;
  estimatedAmountMin?: number | null;
  estimatedAmountMax?: number | null;
}

/**
 * Le demandeur modifie sa PROPRE demande — confirmé le 13 août 2026 :
 * description/fournisseur/montant estimé seulement (jamais la catégorie ni
 * le projet, qui déterminent le seuil gelé), et seulement tant qu'elle
 * reste owner_pending/boss_pending. editedAt sert de signal pour Direction
 * dans son centre d'action (PurchaseRequestList), pas de système de
 * notification séparé.
 */
export async function updatePurchaseRequest(id: string, requesterId: string, patch: UpdatePurchaseRequestInput): Promise<PurchaseRequest> {
  const request = await prisma.purchaseRequest.findUnique({ where: { id } });
  if (!request) throw new HttpError(404, "Demande d'achat introuvable.");
  if (request.requesterId !== requesterId) throw new HttpError(403, "Vous ne pouvez modifier que vos propres demandes.");
  if (!PENDING_STATUSES.includes(request.status)) {
    throw new HttpError(400, "Cette demande n'est plus modifiable (déjà autorisée ou rejetée).");
  }
  if (patch.description !== undefined && !patch.description.trim()) {
    throw new HttpError(400, "La description est requise.");
  }
  return prisma.purchaseRequest.update({
    where: { id },
    data: {
      ...(patch.description !== undefined ? { description: patch.description.trim() } : {}),
      ...(patch.supplier !== undefined ? { supplier: patch.supplier?.trim() || null } : {}),
      ...(patch.estimatedAmountMin !== undefined ? { estimatedAmountMin: patch.estimatedAmountMin } : {}),
      ...(patch.estimatedAmountMax !== undefined ? { estimatedAmountMax: patch.estimatedAmountMax } : {}),
      editedAt: new Date(),
    },
  });
}

/** Direction fait progresser le suivi — seulement une fois autorisée (voir canManagePurchaseFulfillment, roles.ts). */
export async function setFulfillmentStatus(id: string, status: FulfillmentStatus): Promise<PurchaseRequest> {
  const request = await prisma.purchaseRequest.findUnique({ where: { id } });
  if (!request) throw new HttpError(404, "Demande d'achat introuvable.");
  if (request.status !== "authorized") {
    throw new HttpError(400, "Le suivi de commande ne s'applique qu'aux demandes autorisées.");
  }
  return prisma.purchaseRequest.update({ where: { id }, data: { fulfillmentStatus: status } });
}

/**
 * Applique l'achat autorisé au projet — geste explicite et distinct de
 * l'autorisation (confirmé le 13 août 2026) : exige d'abord fulfillmentStatus
 * === "received", jamais automatique. C'est ce champ, pas le statut
 * "authorized" seul, qui doit compter dans les futurs totaux d'achats du
 * projet (voir en-tête de fichier).
 */
export async function applyPurchaseRequestToProject(id: string): Promise<PurchaseRequest> {
  const request = await prisma.purchaseRequest.findUnique({ where: { id } });
  if (!request) throw new HttpError(404, "Demande d'achat introuvable.");
  if (request.fulfillmentStatus !== "received") {
    throw new HttpError(400, "L'achat doit être marqué « Reçu » avant d'être appliqué au projet.");
  }
  if (request.appliedToProjectAt) throw new HttpError(400, "Cet achat a déjà été appliqué au projet.");
  return prisma.purchaseRequest.update({ where: { id }, data: { appliedToProjectAt: new Date() } });
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

/**
 * Total des achats RÉELS d'un projet — implémente exactement la formule
 * documentée en en-tête de fichier (17 août 2026, écran projet) : somme des
 * PurchaseRequest APPLIQUÉES (appliedToProjectAt non nul) + des
 * ProjectPurchaseEntry APPROUVÉES pour ce projet. Toujours calculé à la
 * lecture, jamais un champ maintenu sur Project.
 */
export async function projectPurchasesActual(projectId: string): Promise<number> {
  const [appliedRequests, approvedEntries] = await Promise.all([
    prisma.purchaseRequest.aggregate({ where: { projectId, appliedToProjectAt: { not: null } }, _sum: { amount: true } }),
    prisma.projectPurchaseEntry.aggregate({ where: { projectId, status: "approved" }, _sum: { amount: true } }),
  ]);
  return round2(Number(appliedRequests._sum.amount ?? 0) + Number(approvedEntries._sum.amount ?? 0));
}
