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
  externalSaleInvoiceLines,
  chooseFulfillment as chooseFulfillmentPure,
  confirmFulfillment as confirmFulfillmentPure,
  FULFILLMENT_MODES,
  type FulfillmentMode,
  type Persona,
} from "@gsc-pilot/business-rules";
import { prisma } from "../../db.js";
import { HttpError } from "../../middleware/errorHandler.js";
import { ensureContactRow } from "../clientRequests/service.js";
import { allocatePurchaseRequestNumbers, toPurchaseRequestDto, PENDING_STATUSES, type PurchaseRequestDto } from "../purchases/service.js";
import { resolveSequentialNumber } from "../settings/sequentialNumbers.js";
import { createFulfillmentDelivery } from "../deliveries/service.js";
import {
  buildInvoiceRequestPreview,
  confirmInvoiceRequestInTx,
  type InvoiceRequestPreviewDto,
  type InvoicePlanEntryDto,
} from "../projects/service.js";
import type { ExternalSale, Prisma } from "../../generated/prisma/client.js";

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
  /** Posé uniquement par convertExternalSaleQuoteToSale (externalSaleQuotes/service.ts, 23 novembre 2026) — jamais fourni par le formulaire de création directe. */
  quoteId?: string;
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
  const { partsBaseCost, salePrice } = externalSaleTotals(input.lines, input.transportFee, input.adminFee, input.marginPct);

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
        quoteId: input.quoteId ?? null,
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
  /** Manquants jusqu'au 23 novembre 2026 (édition de la vente) — existaient en base, jamais exposés faute de besoin avant ExternalSaleEditForm.tsx. */
  contactRole: string | null;
  phone: string | null;
  email: string | null;
  clientRequestId: string | null;
  /** Soumission d'origine (24 novembre 2026, section Documents) — null si la vente a été créée directement, jamais depuis une soumission convertie. */
  quoteId: string | null;
  quoteDisplayId: string | null;
  /** Confirmation de commande de la soumission d'origine (25 novembre 2026, section Documents) — null si absente ou si vente créée directement. */
  confirmationId: string | null;
  confirmationDisplayId: string | null;
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
  /** Posé par requestExternalSaleInvoice — jamais réinitialisé (même principe que partout ailleurs : gelé une fois demandé). */
  invoiceRequestedAt: string | null;
  /** Section Documents (17 novembre 2026) — lien direct vers la Facture envoyée, si elle existe. Au plus une (voir invoiceEntries ci-dessous). */
  invoiceEntryId: string | null;
  invoiceNumber: string | null;
  createdAt: string;
  lines: PurchaseRequestDto[];
}

async function loadExternalSaleOrThrow(id: string) {
  const sale = await prisma.externalSale.findUnique({
    where: { id },
    include: {
      contact: { select: { name: true, company: true, role: true, phone: true, email: true } },
      // Au plus une ligne (requestExternalSaleInvoice bloque une 2e demande)
      // — voir ExternalSaleDetailDto.invoiceRequestedAt/invoiceEntryId ci-dessous.
      invoiceEntries: { select: { id: true, requestedAt: true, invoiceNumber: true } },
      quote: { select: { displayId: true, confirmation: { select: { id: true, displayId: true } } } },
    },
  });
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
      photos: true,
    },
    orderBy: { requestedAt: "asc" },
  });

  return {
    id: sale.id,
    displayId: sale.displayId,
    contactId: sale.contactId,
    contactName: sale.contact.name,
    company: sale.contact.company,
    contactRole: sale.contact.role,
    phone: sale.contact.phone,
    email: sale.contact.email,
    clientRequestId: sale.clientRequestId,
    quoteId: sale.quoteId,
    quoteDisplayId: sale.quote?.displayId ?? null,
    confirmationId: sale.quote?.confirmation?.id ?? null,
    confirmationDisplayId: sale.quote?.confirmation?.displayId ?? null,
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
    invoiceRequestedAt: sale.invoiceEntries[0]?.requestedAt?.toISOString() ?? null,
    invoiceEntryId: sale.invoiceEntries[0]?.id ?? null,
    invoiceNumber: sale.invoiceEntries[0]?.invoiceNumber ?? null,
    createdAt: sale.createdAt.toISOString(),
    lines: purchaseRows.map((row) => toPurchaseRequestDto(row, viewerPersona)),
  };
}

/**
 * Modifier la vente (23 novembre 2026, demande explicite) — gelée dès que
 * la facturation a été demandée (invoiceEntries.length > 0, déjà exposé
 * comme invoiceRequestedAt sur le DTO), jamais sur status==="ready_invoice"
 * (qui reste réversible via setExternalSaleCompleted, sans lien avec le gel
 * financier) — même principe que updateProjectBillingPlan
 * (projects/service.ts), qui bloque sur la facturation RÉELLEMENT démarrée,
 * jamais sur un statut de fin de cycle.
 */
async function assertExternalSaleEditable(sale: { invoiceEntries: { id: string }[] }): Promise<void> {
  if (sale.invoiceEntries.length > 0) {
    throw new HttpError(409, "Impossible de modifier une vente dont la facturation a déjà été demandée.");
  }
}

/** partsBaseCost/salePrice ne sont PLUS gelés pour toujours une fois l'édition possible — recalculés à partir des lignes CONTRAIREMENT à la création, où ils sont gelés et jamais retouchés (voir en-tête du fichier). */
async function recomputeExternalSaleTotals(
  tx: Prisma.TransactionClient,
  saleId: string,
  transportFee: number,
  adminFee: number,
  marginPct: number,
): Promise<void> {
  const lines = await tx.purchaseRequest.findMany({ where: { externalSaleId: saleId }, select: { qty: true, unitCost: true } });
  const { partsBaseCost, salePrice } = externalSaleTotals(
    lines.map((line) => ({ qty: Number(line.qty ?? 0), unitCost: Number(line.unitCost ?? 0) })),
    transportFee,
    adminFee,
    marginPct,
  );
  await tx.externalSale.update({ where: { id: saleId }, data: { partsBaseCost, salePrice } });
}

export interface UpdateExternalSaleHeaderInput {
  newContact?: NewExternalSaleContactInput;
  transportFee?: number;
  adminFee?: number;
  marginPct?: number;
}

/** Contact re-résolu via ensureContactRow — même mécanisme qu'à la création (createExternalSale), jamais un second chemin de résolution de contact inventé. */
export async function updateExternalSaleHeader(id: string, input: UpdateExternalSaleHeaderInput): Promise<void> {
  const sale = await loadExternalSaleOrThrow(id);
  await assertExternalSaleEditable(sale);

  const contactId = input.newContact ? (await ensureContactRow({ ...input.newContact, requestType: "sale" })).id : sale.contactId;
  const transportFee = input.transportFee ?? Number(sale.transportFee);
  const adminFee = input.adminFee ?? Number(sale.adminFee);
  const marginPct = input.marginPct ?? Number(sale.marginPct);

  await prisma.$transaction(async (tx) => {
    await tx.externalSale.update({ where: { id }, data: { contactId, transportFee, adminFee, marginPct } });
    await recomputeExternalSaleTotals(tx, id, transportFee, adminFee, marginPct);
  });
}

/**
 * Une ligne (= PurchaseRequest, projectType==="sale") ne reste modifiable
 * depuis l'écran Vente externe QUE tant qu'elle est encore owner_pending/
 * boss_pending (PENDING_STATUSES, purchases/service.ts) — une ligne déjà
 * approuvée/commandée/reçue/rejetée garde sa propre correction étroite
 * existante (setPurchaseRequestAmount, module Achats), jamais contournée
 * ici.
 */
async function loadExternalSaleLineOrThrow(saleId: string, lineId: string) {
  const line = await prisma.purchaseRequest.findUnique({ where: { id: lineId } });
  if (!line || line.externalSaleId !== saleId) throw new HttpError(404, "Ligne introuvable.");
  if (!PENDING_STATUSES.includes(line.status)) {
    throw new HttpError(400, "Cette ligne n'est plus modifiable (déjà autorisée, commandée ou rejetée).");
  }
  return line;
}

/** requesterId = sale.createdById — symétrique avec les lignes d'origine de la vente, jamais l'id de la personne qui édite. */
export async function addExternalSaleLine(saleId: string, input: ExternalSaleLineInput): Promise<void> {
  const sale = await loadExternalSaleOrThrow(saleId);
  await assertExternalSaleEditable(sale);
  if (!input.description?.trim()) throw new HttpError(400, "La description est requise.");

  const amount = externalSaleLineAmount(input.qty, input.unitCost);

  await prisma.$transaction(async (tx) => {
    const settings = await tx.settings.findFirst();
    if (!settings) throw new HttpError(500, "Paramètres non initialisés — lancer le seed.");
    const [displayId] = await allocatePurchaseRequestNumbers(tx, settings, 1);
    await tx.purchaseRequest.create({
      data: {
        displayId: displayId!,
        requesterId: sale.createdById,
        projectType: "sale",
        externalSaleId: saleId,
        qty: input.qty,
        unitCost: input.unitCost,
        amount,
        description: input.description.trim(),
        status: "owner_pending",
      },
    });
    await recomputeExternalSaleTotals(tx, saleId, Number(sale.transportFee), Number(sale.adminFee), Number(sale.marginPct));
  });
}

export interface UpdateExternalSaleLineInput {
  description?: string;
  qty?: number;
  unitCost?: number;
}

export async function updateExternalSaleLine(saleId: string, lineId: string, patch: UpdateExternalSaleLineInput): Promise<void> {
  const sale = await loadExternalSaleOrThrow(saleId);
  await assertExternalSaleEditable(sale);
  const line = await loadExternalSaleLineOrThrow(saleId, lineId);
  if (patch.description !== undefined && !patch.description.trim()) {
    throw new HttpError(400, "La description est requise.");
  }

  const qty = patch.qty ?? Number(line.qty);
  const unitCost = patch.unitCost ?? Number(line.unitCost);
  const amount = externalSaleLineAmount(qty, unitCost);

  await prisma.$transaction(async (tx) => {
    await tx.purchaseRequest.update({
      where: { id: lineId },
      data: {
        ...(patch.description !== undefined ? { description: patch.description!.trim() } : {}),
        qty,
        unitCost,
        amount,
      },
    });
    await recomputeExternalSaleTotals(tx, saleId, Number(sale.transportFee), Number(sale.adminFee), Number(sale.marginPct));
  });
}

/** Suppression définitive — une ligne encore pending n'a aucun historique d'approbation, même état qu'une ligne retirée avant soumission dans ExternalSaleForm.tsx. Jamais de PurchaseRequestPhoto sur une ligne de Vente externe en pratique (aucun chemin d'upload pour ce projectType), mais nettoyées quand même par prudence — même geste que purge.ts. */
export async function removeExternalSaleLine(saleId: string, lineId: string): Promise<void> {
  const sale = await loadExternalSaleOrThrow(saleId);
  await assertExternalSaleEditable(sale);
  await loadExternalSaleLineOrThrow(saleId, lineId);

  const remaining = await prisma.purchaseRequest.count({ where: { externalSaleId: saleId } });
  if (remaining <= 1) throw new HttpError(400, "Une vente doit garder au moins une ligne.");

  await prisma.$transaction(async (tx) => {
    await tx.purchaseRequestPhoto.deleteMany({ where: { purchaseRequestId: lineId } });
    await tx.purchaseRequest.delete({ where: { id: lineId } });
    await recomputeExternalSaleTotals(tx, saleId, Number(sale.transportFee), Number(sale.adminFee), Number(sale.marginPct));
  });
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

/**
 * Marque/démarque manuellement une vente comme terminée (19 octobre 2026,
 * demande explicite de l'utilisatrice) — indépendant du cheminement
 * automatique par confirmExternalSaleFulfillment/confirmWarehouseDelivery
 * (deliveries/service.ts) ci-dessus, qui atteint déjà "ready_invoice" pour
 * les modes tiers/ramassage/bon de livraison. Nécessaire pour le mode
 * installation (ne se ferme jamais automatiquement, voir
 * fulfillmentClosesEntity, fulfillment.ts) et pour toute vente qu'elle
 * considère terminée sans passer par le rituel complet de fulfillment.
 * Réversible — même esprit que setRollingArchived/setProjectArchived :
 * jamais un aller simple, aucune donnée supprimée ni recalculée (partsBaseCost/
 * salePrice restent gelés comme toujours). Alimente la section "Ventes
 * terminées" de ExternalSaleList.tsx, au même titre qu'une vente ayant
 * atteint ready_invoice automatiquement.
 */
export async function setExternalSaleCompleted(id: string, completed: boolean): Promise<void> {
  await loadExternalSaleOrThrow(id);
  await prisma.externalSale.update({ where: { id }, data: { status: completed ? "ready_invoice" : "active" } });
}

/**
 * Lignes de pièces de la vente (PurchaseRequest liées, projectType==="sale")
 * pour le calcul des lignes de Facture ci-dessous — TOUTES les lignes, y
 * compris une éventuellement rejetée (même principe que partsBaseCost/
 * salePrice ci-dessus : gelés à la création, une ligne rejetée y reste
 * comptée, donc la ventilation de la Facture doit elle aussi la garder pour
 * que la somme corresponde).
 */
async function getExternalSalePurchaseLines(id: string): Promise<{ description: string; qty: number; unitCost: number }[]> {
  const rows = await prisma.purchaseRequest.findMany({
    where: { externalSaleId: id },
    select: { description: true, qty: true, unitCost: true },
    orderBy: { requestedAt: "asc" },
  });
  return rows.map((row) => ({ description: row.description ?? "—", qty: Number(row.qty), unitCost: Number(row.unitCost) }));
}

/**
 * Aperçu avant confirmation (RequestInvoiceModal, 13 novembre 2026) — même
 * rôle que previewInvoiceRequest (projects/service.ts) mais sans
 * InvoicePlanEntry encore créée. Lignes suggérées (17 novembre 2026) :
 * toujours dérivées automatiquement (jamais vides par défaut comme pour
 * Projet/Roulement) — une vente externe a toujours ses pièces/transport/
 * frais administratifs déjà connus, aucune raison de partir d'une page
 * blanche. Reste éditable dans RequestInvoiceModal comme partout ailleurs.
 */
export async function previewExternalSaleInvoice(id: string): Promise<InvoiceRequestPreviewDto> {
  const sale = await loadExternalSaleOrThrow(id);
  if (sale.status !== "ready_invoice") throw new HttpError(400, "La vente doit d'abord être terminée.");
  if (sale.invoiceEntries.length > 0) throw new HttpError(409, "Facturation déjà demandée pour cette vente.");
  const preview = await buildInvoiceRequestPreview(Number(sale.salePrice));
  const lines = await getExternalSalePurchaseLines(id);
  preview.suggestedLines = externalSaleInvoiceLines(lines, Number(sale.transportFee), Number(sale.adminFee), Number(sale.marginPct));
  return preview;
}

/**
 * Demande la facturation d'une vente externe terminée — geste séparé de
 * setExternalSaleCompleted ci-dessus (jamais combiné) : "Terminer la vente"
 * reste réversible ("Réactiver la vente"), la facturation se corrige
 * maintenant via cancelInvoiceRequest (projects/service.ts, "Annuler la
 * demande", 13 novembre 2026 — avant cette date, aucun équivalent
 * n'existait). Un seul jalon à 100 % du prix vendu — comme un appel de
 * service, une vente externe ne se répartit jamais en plusieurs jalons
 * (computeBillingPlan reste réservé aux projets). Crée le jalon ET
 * l'attribue réellement (numéro/taxes/échéance) dans la MÊME transaction —
 * jamais d'état intermédiaire "créé mais sans numéro", même principe que
 * createServiceCallInvoiceForSelection (serviceCalls/service.ts). Alimente l'écran
 * Facturation consolidé (voir invoicing/service.ts, listInvoiceEntries).
 */
export async function requestExternalSaleInvoice(
  id: string,
  requestedById: string,
  note?: string,
  lines?: { description: string; qty: number; unitPrice: number }[],
): Promise<InvoicePlanEntryDto> {
  const sale = await loadExternalSaleOrThrow(id);
  if (sale.status !== "ready_invoice") throw new HttpError(400, "La vente doit d'abord être terminée.");
  if (sale.invoiceEntries.length > 0) throw new HttpError(409, "Facturation déjà demandée pour cette vente.");
  return prisma.$transaction(async (tx) => {
    const entry = await tx.invoicePlanEntry.create({
      data: { externalSaleId: id, label: sale.displayId, pct: 100, amount: sale.salePrice, sortOrder: 0 },
    });
    return confirmInvoiceRequestInTx(tx, entry.id, requestedById, { note, lines });
  });
}
