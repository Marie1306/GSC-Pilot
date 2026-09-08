/**
 * GSC Pilot — Vente externe (nouveau module, 8 septembre 2026)
 *
 * Vendre des pièces sans passer par le cycle Projet complet (pas d'heures,
 * pas de fabrication à suivre). Voir packages/business-rules/src/external-sales.ts
 * pour le calcul des totaux (marge globale unique, réutilise saleFromCost).
 *
 * Chaque ligne de pièce devient automatiquement une PurchaseRequest liée
 * (projectType==="sale") dans LA MÊME transaction que la vente — le
 * sous-processus d'achat (approbation, suivi de commande) reste le
 * mécanisme EXISTANT, inchangé (canApprovePurchaseRequest/
 * canManagePurchaseFulfillment, roles.ts) : confirmé explicitement avec
 * l'utilisatrice, « accès complet à égalité » ne couvre que les gestes
 * propres à CETTE entité (créer, marquer prête à livrer, choisir/confirmer
 * la livraison), jamais ce sous-processus.
 *
 * Numérotation VE-AAAA-NNNN à remise à zéro annuelle dès le départ (voir
 * settings/sequentialNumbers.ts, même mécanisme que le correctif du 8
 * septembre 2026 sur les 5 autres modules) — jamais le format 5 chiffres
 * perpétuel des Achats (DA-).
 *
 * Fulfillment : réutilise chooseFulfillment/confirmFulfillment/
 * confirmWarehouseDelivery (fulfillment.ts, jamais modifiés) tels quels —
 * ExternalSale porte les mêmes champs fulfillment* que Project/Rolling
 * pour ça. readyToDeliver joue le rôle de productionCompleted (nommé
 * différemment : une vente ne "produit" rien) — gardé par
 * markExternalSaleReadyToDeliver, qui exige que toutes les PurchaseRequest
 * liées NON rejetées soient reçues ET appliquées.
 */
import {
  externalSaleLineAmount,
  externalSaleTotals,
  chooseFulfillment as chooseFulfillmentPure,
  confirmFulfillment as confirmFulfillmentPure,
  FULFILLMENT_MODES,
  type FulfillmentMode,
  type Persona,
} from "@gsc-pilot/business-rules";
import { prisma } from "../../db.js";
import { HttpError } from "../../middleware/errorHandler.js";
import { ensureContactRow } from "../clientRequests/service.js";
import { allocatePurchaseRequestNumbers, toPurchaseRequestDto, type PurchaseRequestDto } from "../purchases/service.js";
import { resolveSequentialNumber } from "../settings/sequentialNumbers.js";
import { createFulfillmentDelivery } from "../deliveries/service.js";
import type { ExternalSale } from "../../generated/prisma/client.js";

/** Remise à zéro annuelle (8 septembre 2026) — voir settings/sequentialNumbers.ts. */
function resolveNextExternalSaleNumber(settings: { nextExternalSaleNumber: number; externalSaleNumberYear: number }, year?: number) {
  return resolveSequentialNumber({ next: settings.nextExternalSaleNumber, year: settings.externalSaleNumberYear }, year);
}

function formatExternalSaleDisplayId(year: number, number: number): string {
  return `VE-${year}-${String(number).padStart(4, "0")}`;
}

function runFulfillmentStep<T>(fn: () => T): T {
  try {
    return fn();
  } catch (err) {
    throw new HttpError(400, err instanceof Error ? err.message : "Erreur de validation.");
  }
}

export interface NextExternalSaleNumberDto {
  nextDisplayId: string;
  defaultMarginPct: number;
}

/** Aperçu du prochain numéro + marge par défaut — jamais incrémenté (voir /projects/next-number, même patron). */
export async function getNextExternalSaleDisplayId(): Promise<NextExternalSaleNumberDto> {
  const settings = await prisma.settings.findFirst();
  if (!settings) throw new HttpError(500, "Paramètres non initialisés — lancer le seed.");
  const { year, number } = resolveNextExternalSaleNumber(settings);
  return { nextDisplayId: formatExternalSaleDisplayId(year, number), defaultMarginPct: Number(settings.externalSaleDefaultMarginPct) };
}

export interface ExternalSaleLineInput {
  description: string;
  qty: number;
  unitCost: number;
}

export interface NewExternalSaleContactInput {
  contactName: string;
  company?: string;
  contactRole?: string;
  phone?: string;
  email?: string;
}

export interface CreateExternalSaleInput {
  clientRequestId?: string;
  newContact: NewExternalSaleContactInput;
  lines: ExternalSaleLineInput[];
  transportFee: number;
  adminFee: number;
  marginPct: number;
}

async function assertClientRequestConvertibleToExternalSale(clientRequestId: string): Promise<void> {
  const request = await prisma.clientRequest.findUnique({ where: { id: clientRequestId }, select: { externalSaleId: true } });
  if (!request) throw new HttpError(404, "Demande client introuvable.");
  if (request.externalSaleId) throw new HttpError(400, "Cette demande a déjà une vente externe.");
}

/**
 * Création — transaction unique : (a) la vente avec ses totaux gelés
 * (externalSaleTotals), (b) UNE PurchaseRequest par ligne de pièce
 * (categoryId nul, comme la liste rapide — jamais de seuil déclenché), (c)
 * les DEUX compteurs (nextExternalSaleNumber + nextPurchaseRequestNumber)
 * incrémentés ensemble, (d) si clientRequestId fourni, la demande posée
 * "convertie" — même mécanique que createServiceCall/createRollingDirect.
 */
export async function createExternalSale(createdById: string, input: CreateExternalSaleInput): Promise<ExternalSale> {
  if (!input.newContact?.contactName?.trim()) throw new HttpError(400, "Le nom du contact est requis.");
  if (!input.lines || input.lines.length === 0) throw new HttpError(400, "Au moins une ligne de pièce est requise.");
  for (const line of input.lines) {
    if (!line.description?.trim()) throw new HttpError(400, "Chaque ligne doit avoir une description.");
  }
  if (input.clientRequestId) await assertClientRequestConvertibleToExternalSale(input.clientRequestId);

  const contact = await ensureContactRow({ ...input.newContact, requestType: "sale" });

  const lineAmounts = input.lines.map((line) => externalSaleLineAmount(line.qty, line.unitCost));
  const { partsBaseCost, salePrice } = externalSaleTotals(lineAmounts, input.transportFee, input.adminFee, input.marginPct);

  return prisma.$transaction(async (tx) => {
    const settings = await tx.settings.findFirst();
    if (!settings) throw new HttpError(500, "Paramètres non initialisés — lancer le seed.");

    const { year, number } = resolveNextExternalSaleNumber(settings);
    const displayId = formatExternalSaleDisplayId(year, number);

    const sale = await tx.externalSale.create({
      data: {
        displayId,
        contactId: contact.id,
        clientRequestId: input.clientRequestId ?? null,
        partsBaseCost,
        transportFee: input.transportFee,
        adminFee: input.adminFee,
        marginPct: input.marginPct,
        salePrice,
        createdById,
      },
    });
    await tx.settings.update({ where: { id: settings.id }, data: { nextExternalSaleNumber: number + 1, externalSaleNumberYear: year } });

    const purchaseDisplayIds = await allocatePurchaseRequestNumbers(tx, settings, input.lines.length);
    for (let i = 0; i < input.lines.length; i++) {
      const line = input.lines[i]!;
      await tx.purchaseRequest.create({
        data: {
          displayId: purchaseDisplayIds[i]!,
          requesterId: createdById,
          projectType: "sale",
          externalSaleId: sale.id,
          qty: line.qty,
          unitCost: line.unitCost,
          amount: lineAmounts[i]!,
          description: line.description.trim(),
          status: "owner_pending",
        },
      });
    }

    if (input.clientRequestId) {
      await tx.clientRequest.update({ where: { id: input.clientRequestId }, data: { externalSaleId: sale.id, status: "converted" } });
    }

    return sale;
  });
}

export interface ExternalSaleListItemDto {
  id: string;
  displayId: string;
  contactName: string;
  company: string | null;
  status: string;
  readyToDeliver: boolean;
  salePrice: number;
  createdAt: string;
}

export async function listExternalSales(): Promise<ExternalSaleListItemDto[]> {
  const rows = await prisma.externalSale.findMany({
    where: { deletedAt: null },
    include: { contact: { select: { name: true, company: true } } },
    orderBy: { createdAt: "desc" },
  });
  return rows.map((row) => ({
    id: row.id,
    displayId: row.displayId,
    contactName: row.contact.name,
    company: row.contact.company,
    status: row.status,
    readyToDeliver: row.readyToDeliver,
    salePrice: Number(row.salePrice),
    createdAt: row.createdAt.toISOString(),
  }));
}

export interface ExternalSaleDetailDto {
  id: string;
  displayId: string;
  contactId: string;
  contactName: string;
  company: string | null;
  clientRequestId: string | null;
  partsBaseCost: number;
  transportFee: number;
  adminFee: number;
  marginPct: number;
  salePrice: number;
  readyToDeliver: boolean;
  status: string;
  fulfillmentMode: string | null;
  fulfillmentStatus: string | null;
  fulfillmentDriverId: string | null;
  fulfillmentAddress: string | null;
  fulfillmentScheduled: string | null;
  billingReady: boolean;
  fulfillmentConfirmationNote: string | null;
  createdAt: string;
  lines: PurchaseRequestDto[];
}

async function loadExternalSaleOrThrow(id: string) {
  const sale = await prisma.externalSale.findUnique({ where: { id }, include: { contact: { select: { name: true, company: true } } } });
  if (!sale) throw new HttpError(404, "Vente externe introuvable.");
  return sale;
}

/** Lignes = PurchaseRequest liées (projectType==="sale") — jamais une table séparée, voir en-tête du schéma. */
export async function getExternalSaleDetail(id: string, viewerPersona: Persona): Promise<ExternalSaleDetailDto> {
  const sale = await loadExternalSaleOrThrow(id);
  const purchaseRows = await prisma.purchaseRequest.findMany({
    where: { externalSaleId: id },
    include: {
      requester: { select: { name: true, persona: true } },
      project: { select: { projectNumber: true, name: true } },
      externalSale: { select: { displayId: true } },
      category: { select: { name: true } },
    },
    orderBy: { requestedAt: "asc" },
  });

  return {
    id: sale.id,
    displayId: sale.displayId,
    contactId: sale.contactId,
    contactName: sale.contact.name,
    company: sale.contact.company,
    clientRequestId: sale.clientRequestId,
    partsBaseCost: Number(sale.partsBaseCost),
    transportFee: Number(sale.transportFee),
    adminFee: Number(sale.adminFee),
    marginPct: Number(sale.marginPct),
    salePrice: Number(sale.salePrice),
    readyToDeliver: sale.readyToDeliver,
    status: sale.status,
    fulfillmentMode: sale.fulfillmentMode,
    fulfillmentStatus: sale.fulfillmentStatus,
    fulfillmentDriverId: sale.fulfillmentDriverId,
    fulfillmentAddress: sale.fulfillmentAddress,
    fulfillmentScheduled: sale.fulfillmentScheduled?.toISOString() ?? null,
    billingReady: sale.billingReady,
    fulfillmentConfirmationNote: sale.fulfillmentConfirmationNote,
    createdAt: sale.createdAt.toISOString(),
    lines: purchaseRows.map((row) => toPurchaseRequestDto(row, viewerPersona)),
  };
}

/**
 * Geste explicite "Marquer prêt à être livré" — gardé par : toutes les
 * PurchaseRequest liées NON rejetées sont fulfillmentStatus==="received" ET
 * appliedToExternalSaleAt posé. Une ligne rejetée (statut terminal, jamais
 * re-soumise) sort du calcul plutôt que de bloquer la vente pour toujours
 * (confirmé avec l'utilisatrice) — elle reste comptée dans partsBaseCost/
 * salePrice, gelés à la création et jamais recalculés après coup, même
 * principe que partout ailleurs dans l'application.
 */
export async function markExternalSaleReadyToDeliver(id: string): Promise<void> {
  const sale = await loadExternalSaleOrThrow(id);
  if (sale.readyToDeliver) throw new HttpError(400, "Cette vente est déjà marquée prête à être livrée.");
  const unresolved = await prisma.purchaseRequest.count({
    where: {
      externalSaleId: id,
      status: { not: "rejected" },
      OR: [{ fulfillmentStatus: { not: "received" } }, { appliedToExternalSaleAt: null }],
    },
  });
  if (unresolved > 0) {
    throw new HttpError(400, "Toutes les pièces (sauf refusées) doivent être reçues et appliquées avant de marquer la vente prête à être livrée.");
  }
  await prisma.externalSale.update({ where: { id }, data: { readyToDeliver: true } });
}

export interface ChooseExternalSaleFulfillmentInput {
  mode: FulfillmentMode;
  driverId?: string | null;
  address?: string;
  scheduled?: string | null;
}

/** Réutilise chooseFulfillment (fulfillment.ts) tel quel — readyToDeliver joue le rôle de productionCompleted. */
export async function chooseExternalSaleFulfillmentMode(id: string, input: ChooseExternalSaleFulfillmentInput): Promise<void> {
  const sale = await loadExternalSaleOrThrow(id);
  if (sale.fulfillmentMode) throw new HttpError(400, "Le mode de sortie est déjà choisi pour cette vente.");

  const updated = runFulfillmentStep(() =>
    chooseFulfillmentPure(
      {
        productionCompleted: sale.readyToDeliver,
        fulfillmentMode: (sale.fulfillmentMode ?? undefined) as FulfillmentMode | undefined,
        status: sale.status,
      },
      input.mode,
      { driverId: input.driverId ?? null, address: input.address ?? "", scheduled: input.scheduled ?? null },
    ),
  );

  await prisma.$transaction(async (tx) => {
    await tx.externalSale.update({
      where: { id },
      data: {
        fulfillmentMode: updated.fulfillmentMode,
        fulfillmentScheduled: updated.fulfillmentScheduled ? new Date(updated.fulfillmentScheduled) : null,
        fulfillmentDriverId: updated.fulfillmentDriver,
        fulfillmentAddress: updated.fulfillmentAddress,
        fulfillmentStatus: updated.fulfillmentStatus,
      },
    });

    // Mode "Bon de livraison" — même mécanique que Project/Rolling (jamais
    // de confirmExternalSaleFulfillment pour ce mode, voir fulfillment.ts).
    if (input.mode === FULFILLMENT_MODES.WAREHOUSE) {
      const settings = await tx.settings.findFirst();
      if (!settings) throw new HttpError(500, "Paramètres non initialisés — lancer le seed.");
      await createFulfillmentDelivery(tx, settings, {
        type: "sale",
        externalSaleId: id,
        contactId: sale.contactId,
        address: input.address,
        scheduled: input.scheduled,
        driverId: input.driverId,
      });
    }
  });
}

/** Confirmer un mode tiers/ramassage/installation — jamais pour warehouse (voir chooseExternalSaleFulfillmentMode). */
export async function confirmExternalSaleFulfillment(id: string, note?: string): Promise<void> {
  const sale = await loadExternalSaleOrThrow(id);

  const updated = runFulfillmentStep(() =>
    confirmFulfillmentPure(
      {
        fulfillmentMode: (sale.fulfillmentMode ?? undefined) as FulfillmentMode | undefined,
        billingReady: sale.billingReady,
        fulfillmentStatus: sale.fulfillmentStatus ?? undefined,
        status: sale.status,
      },
      note ?? "",
    ),
  );

  await prisma.externalSale.update({
    where: { id },
    data: {
      billingReady: updated.billingReady,
      fulfillmentStatus: updated.fulfillmentStatus,
      fulfillmentConfirmationNote: updated.fulfillmentConfirmationNote,
      status: updated.status,
    },
  });
}
