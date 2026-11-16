/**
 * GSC Pilot — Appels de service (18-19 août 2026)
 *
 * Refonte complète du module (Chantier D, 16 novembre 2026, demande
 * explicite de l'utilisatrice) : dans la réalité du terrain (auparavant sur
 * papier), UN Call de service (l'appel du client qui confirme un besoin)
 * peut donner lieu à PLUSIEURS Bons de travail — un par déplacement
 * physique, peu importe le nombre de techniciens sur ce déplacement (jamais
 * un BT par technicien). `ServiceCall` est donc devenu un DOSSIER qui
 * contient plusieurs `BonDeTravail` — tout ce qui vivait à plat sur
 * ServiceCall (km/heures/repas/signature/approbation/pièces/photos/temps)
 * vit maintenant par Bon de travail. Voir CLAUDE.md pour le contexte complet
 * et la migration des données réelles existantes.
 *
 * Cycle par Bon de travail (inchangé dans l'esprit, juste rescopé) : résumé
 * obligatoire → signature client → approbation Direction
 * (canApproveServiceCall, OWNER seulement — précédent étroit propre à ce
 * module, jamais BOSS). Facturation sélective (nouveau, 16 novembre 2026) :
 * Marie choisit, parmi les BT approuvés pas encore facturés d'un Call,
 * lesquels mettre sur une même facture — plusieurs factures distinctes
 * peuvent donc exister pour un même Call au fil du temps.
 *
 * Plusieurs techniciens peuvent être assignés à un même Bon de travail
 * (confirmé le 19 août 2026 — « ils doivent parfois y aller à deux
 * techniciens »). ServiceCall.assignedEmployees reste séparé : qui est
 * censé s'occuper du DOSSIER (gate canCreateBonDeTravail), distinct de qui
 * est réellement allé sur CE déplacement précis (BonDeTravail.assignedEmployees).
 *
 * Pièces : coût réel = 0$ jusqu'à ce que la Direction tarife après coup
 * (texte libre saisi par le technicien) — confirmé, voir Rapports. Prix de
 * vente = saleFromCost (margin.ts), jamais réimplémenté.
 *
 * Signature : capturée comme une image (dataURL) directement dans
 * signatureImageUrl — aucune vraie infrastructure de stockage de fichiers
 * montée cette passe (portée, voir CLAUDE.md). Photos : structure exposée
 * en lecture seule, téléversement réel différé pour la même raison.
 *
 * Un Bon de travail déjà facturé (invoicePlanEntryId posé) est figé — même
 * principe qu'une facture envoyée partout ailleurs dans l'appli.
 */
import { canSeeServicePricing, saleFromCost, serviceCallLaborTotals, serviceCallExpenseTotal, type Persona } from "@gsc-pilot/business-rules";
import { prisma } from "../../db.js";
import { HttpError } from "../../middleware/errorHandler.js";
import { ensureContactRow } from "../clientRequests/service.js";
import { resolveSequentialNumber } from "../settings/sequentialNumbers.js";
import {
  buildInvoiceRequestPreview,
  confirmInvoiceRequestInTx,
  type InvoiceRequestPreviewDto,
  type InvoicePlanEntryDto,
} from "../projects/service.js";
import type { Prisma, ServiceCall, ServiceCallPart, ServiceCallPhoto } from "../../generated/prisma/client.js";

/** Remise à zéro annuelle (8 septembre 2026) — voir settings/sequentialNumbers.ts. */
function resolveNextServiceCallNumber(settings: { nextServiceCallNumber: number; serviceCallNumberYear: number }, year?: number) {
  return resolveSequentialNumber({ next: settings.nextServiceCallNumber, year: settings.serviceCallNumberYear }, year);
}

/** Même mécanisme, pour BT-AAAA-NNNN (Chantier D). */
function resolveNextBonDeTravailNumber(settings: { nextBonDeTravailNumber: number; bonDeTravailNumberYear: number }, year?: number) {
  return resolveSequentialNumber({ next: settings.nextBonDeTravailNumber, year: settings.bonDeTravailNumberYear }, year);
}

export interface NewServiceCallContact {
  contactName: string;
  company?: string;
  contactRole?: string;
  phone?: string;
  email?: string;
}

export interface CreateServiceCallInput {
  contactId?: string;
  newContact?: NewServiceCallContact;
  /** Titre court (27 août 2026) — toujours saisi par la personne qui crée le call, jamais copié depuis request/summary d'une demande. */
  title: string;
  request: string;
  address?: string;
  /** Qui est censé s'occuper de ce dossier (gate canCreateBonDeTravail) — distinct de BonDeTravail.assignedEmployees. */
  assignedEmployeeIds?: string[];
  /** Conversion directe depuis une demande client (27 août 2026) — voir la validation dans createServiceCall. */
  clientRequestId?: string;
  /**
   * Call lié à un projet (sous-garantie, 27 août 2026) — plusieurs calls
   * peuvent viser le même projet (plusieurs visites), donc pas d'assertion
   * d'unicité comme clientRequestId. Toujours non-facturable séparément
   * (voir assertServiceCallBillable ci-dessous).
   */
  projectId?: string;
  /** Call lié à un roulement (28 août 2026) — même mécanisme exact que projectId ci-dessus. */
  rollingId?: string;
}

/** Titre affiché partout (liste, sous-titre du détail, rapports, facturation, dossiers liés) — retombe sur request pour les calls créés avant l'ajout de ce champ. */
export function serviceCallDisplayTitle(call: { title: string | null; request: string }): string {
  return call.title ?? call.request;
}

async function resolveContactId(input: CreateServiceCallInput): Promise<string> {
  if (input.contactId) {
    const contact = await prisma.contact.findUnique({ where: { id: input.contactId } });
    if (!contact) throw new HttpError(404, "Contact introuvable.");
    return contact.id;
  }
  if (!input.newContact) throw new HttpError(400, "Un contact existant ou de nouvelles informations client sont requises.");
  const contact = await ensureContactRow({
    email: input.newContact.email,
    contactName: input.newContact.contactName,
    company: input.newContact.company,
    contactRole: input.newContact.contactRole,
    phone: input.newContact.phone,
    requestType: "service",
  });
  return contact.id;
}

/** Aperçu du prochain numéro — jamais incrémenté (voir /projects/next-number, même patron). */
export async function getNextServiceCallDisplayId(): Promise<string> {
  const settings = await prisma.settings.findFirst();
  if (!settings) throw new HttpError(500, "Paramètres non initialisés — lancer le seed.");
  const { year, number } = resolveNextServiceCallNumber(settings);
  return `CS-${year}-${String(number).padStart(4, "0")}`;
}

/**
 * Conversion directe d'une demande client — même mécanique que
 * Budget↔ClientRequest (voir budgets/service.ts, createBudget).
 */
async function assertClientRequestConvertible(clientRequestId: string): Promise<void> {
  const request = await prisma.clientRequest.findUnique({
    where: { id: clientRequestId },
    select: { serviceCallId: true },
  });
  if (!request) throw new HttpError(404, "Demande client introuvable.");
  if (request.serviceCallId) throw new HttpError(400, "Cette demande a déjà un call de service.");
}

export async function createServiceCall(input: CreateServiceCallInput): Promise<ServiceCall> {
  if (!input.title?.trim()) throw new HttpError(400, "Le titre du call est requis.");
  if (!input.request?.trim()) throw new HttpError(400, "La description de la demande est requise.");
  const contactId = await resolveContactId(input);
  if (input.clientRequestId) await assertClientRequestConvertible(input.clientRequestId);
  if (input.projectId) {
    const project = await prisma.project.findUnique({ where: { id: input.projectId }, select: { id: true } });
    if (!project) throw new HttpError(404, "Projet introuvable.");
  }
  if (input.rollingId) {
    const rolling = await prisma.rolling.findUnique({ where: { id: input.rollingId }, select: { id: true } });
    if (!rolling) throw new HttpError(404, "Roulement introuvable.");
  }

  return prisma.$transaction(async (tx) => {
    const settings = await tx.settings.findFirst();
    if (!settings) throw new HttpError(500, "Paramètres non initialisés — lancer le seed.");
    const { year, number } = resolveNextServiceCallNumber(settings);
    const displayId = `CS-${year}-${String(number).padStart(4, "0")}`;
    const call = await tx.serviceCall.create({
      data: {
        displayId,
        contactId,
        clientRequestId: input.clientRequestId ?? null,
        projectId: input.projectId ?? null,
        rollingId: input.rollingId ?? null,
        title: input.title.trim(),
        request: input.request.trim(),
        address: input.address?.trim() || null,
        assignedEmployees: input.assignedEmployeeIds?.length ? { connect: input.assignedEmployeeIds.map((id) => ({ id })) } : undefined,
      },
    });
    await tx.settings.update({ where: { id: settings.id }, data: { nextServiceCallNumber: number + 1, serviceCallNumberYear: year } });
    if (input.clientRequestId) {
      await tx.clientRequest.update({ where: { id: input.clientRequestId }, data: { serviceCallId: call.id, status: "converted" } });
    }
    return call;
  });
}

export interface AssignedEmployeeDto {
  id: string;
  name: string;
}

/**
 * Statut dérivé d'un Call, calculé à la lecture — jamais stocké (même
 * esprit que invoiceStatus, business-rules). Remplace l'ancien champ
 * ServiceCall.status, mort au-delà de scheduled/approved et retiré du
 * schéma (Chantier D). Gère le cas mixte (facturation sélective : certains
 * BT approuvés déjà facturés, d'autres pas encore) en priorisant "il reste
 * quelque chose à facturer" sur "tout est fait".
 */
export type ServiceCallDerivedStatus = "none" | "in_progress" | "ready_to_invoice" | "invoiced";

export function deriveServiceCallStatus(bonsDeTravail: { ownerApprovedAt: Date | null; invoicePlanEntryId: string | null }[]): ServiceCallDerivedStatus {
  if (bonsDeTravail.length === 0) return "none";
  if (!bonsDeTravail.every((bt) => bt.ownerApprovedAt !== null)) return "in_progress";
  return bonsDeTravail.some((bt) => bt.invoicePlanEntryId === null) ? "ready_to_invoice" : "invoiced";
}

export interface ServiceCallListItemDto {
  id: string;
  displayId: string;
  derivedStatus: ServiceCallDerivedStatus;
  contactName: string;
  company: string | null;
  title: string;
  request: string;
  assignedEmployees: AssignedEmployeeDto[];
  bonsDeTravailCount: number;
  createdAt: string;
  // Prix de vente total (main-d'œuvre + pièces + frais) sur TOUS les Bons de
  // travail du Call, visible seulement si canSeeServicePricing — pour le
  // filtre par tranche de prix (Chantier C Partie B, 16 novembre 2026).
  // Calculé en un seul passage batché pour toute la liste (Settings/
  // TechLevel chargés UNE fois, jamais par ligne). Mêmes fonctions pures
  // que le détail (serviceCallLaborTotals/serviceCallExpenseTotal, jamais
  // réimplémentées), simplement sommées sur chaque Bon de travail.
  salePrice?: number;
}

interface BonDeTravailFinancialsInput {
  kmTraveled: unknown;
  mealsBreakfastCount: number;
  mealsLunchCount: number;
  mealsDinnerCount: number;
  timeEntries: {
    status: string;
    roundedMinutes: number | null;
    costRate: unknown;
    techLevelId: string | null;
    rateType: string | null;
    task: { specificServiceRate: unknown } | null;
  }[];
  parts: { costPerUnit: unknown; salePricePerUnit: unknown; qty: unknown }[];
}

interface ExpenseRates {
  mileageRate: number;
  breakfastRate: number;
  lunchRate: number;
  dinnerRate: number;
}

function bonDeTravailSaleTotal(bt: BonDeTravailFinancialsInput, techLevelsById: Record<string, { regularRate: number; overtimeRate: number; extraRate: number }>, rates: ExpenseRates): number {
  const labor = serviceCallLaborTotals(
    bt.timeEntries.map((entry) => ({
      status: entry.status,
      roundedMinutes: entry.roundedMinutes,
      costRate: Number(entry.costRate),
      techLevelId: entry.techLevelId,
      rateType: entry.rateType,
      specificRate: entry.task?.specificServiceRate !== null && entry.task?.specificServiceRate !== undefined ? Number(entry.task.specificServiceRate) : null,
    })),
    techLevelsById,
  );
  const pricedParts = bt.parts.filter((part) => part.costPerUnit !== null);
  const partsSale = pricedParts.reduce((sum, part) => sum + Number(part.salePricePerUnit ?? 0) * Number(part.qty), 0);
  const expenses = serviceCallExpenseTotal(
    bt.kmTraveled !== null ? Number(bt.kmTraveled) : null,
    { mealsBreakfastCount: bt.mealsBreakfastCount, mealsLunchCount: bt.mealsLunchCount, mealsDinnerCount: bt.mealsDinnerCount },
    rates,
  );
  return labor.sale + partsSale + expenses;
}

async function loadExpenseContext(): Promise<{
  techLevelsById: Record<string, { regularRate: number; overtimeRate: number; extraRate: number }>;
  rates: ExpenseRates;
}> {
  const [techLevels, settings] = await Promise.all([prisma.techLevel.findMany(), prisma.settings.findFirst()]);
  if (!settings) throw new HttpError(500, "Paramètres non initialisés — lancer le seed.");
  return {
    techLevelsById: Object.fromEntries(
      techLevels.map((t) => [t.id, { regularRate: Number(t.regularRate), overtimeRate: Number(t.overtimeRate), extraRate: Number(t.extraRate) }]),
    ),
    rates: {
      mileageRate: Number(settings.mileageRate),
      breakfastRate: Number(settings.breakfastRate),
      lunchRate: Number(settings.lunchRate),
      dinnerRate: Number(settings.dinnerRate),
    },
  };
}

export async function listServiceCalls(viewerPersona: Persona, viewerEmployeeId: string): Promise<ServiceCallListItemDto[]> {
  const showPricing = canSeeServicePricing(viewerPersona);
  const calls = await prisma.serviceCall.findMany({
    where: {
      deletedAt: null,
      ...(viewerPersona === "member" ? { assignedEmployees: { some: { id: viewerEmployeeId } } } : {}),
    },
    include: {
      contact: { select: { name: true, company: true } },
      assignedEmployees: { select: { id: true, name: true } },
      bonsDeTravail: {
        where: { deletedAt: null },
        include: {
          timeEntries: { where: { deletedAt: null }, include: { task: { select: { specificServiceRate: true } } } },
          parts: true,
        },
      },
    },
    orderBy: { createdAt: "desc" },
  });

  // Settings/TechLevel chargés UNE SEULE FOIS pour toute la liste, jamais
  // par ligne ni par Bon de travail — autrement équivalent à un N+1.
  const { techLevelsById, rates } = await loadExpenseContext();

  return calls.map((call) => {
    const derivedStatus = deriveServiceCallStatus(call.bonsDeTravail);
    const salePrice = showPricing
      ? Math.round(call.bonsDeTravail.reduce((sum, bt) => sum + bonDeTravailSaleTotal(bt, techLevelsById, rates), 0) * 100) / 100
      : undefined;

    return {
      id: call.id,
      displayId: call.displayId,
      derivedStatus,
      contactName: call.contact.name,
      company: call.contact.company,
      title: serviceCallDisplayTitle(call),
      request: call.request,
      assignedEmployees: call.assignedEmployees,
      bonsDeTravailCount: call.bonsDeTravail.length,
      createdAt: call.createdAt.toISOString(),
      ...(showPricing && { salePrice }),
    };
  });
}

export interface ServiceCallPartDto {
  id: string;
  name: string;
  qty: number;
  unit: string | null;
  costPerUnit: number | null;
  salePricePerUnit: number | null;
  pricedAt: string | null;
}

function toPartDto(part: ServiceCallPart): ServiceCallPartDto {
  return {
    id: part.id,
    name: part.name,
    qty: Number(part.qty),
    unit: part.unit,
    costPerUnit: part.costPerUnit !== null ? Number(part.costPerUnit) : null,
    salePricePerUnit: part.salePricePerUnit !== null ? Number(part.salePricePerUnit) : null,
    pricedAt: part.pricedAt?.toISOString() ?? null,
  };
}

export interface ServiceCallPhotoDto {
  id: string;
  storagePath: string;
  caption: string | null;
  uploadedAt: string;
}

function toPhotoDto(photo: ServiceCallPhoto): ServiceCallPhotoDto {
  return { id: photo.id, storagePath: photo.storagePath, caption: photo.caption, uploadedAt: photo.uploadedAt.toISOString() };
}

export interface ServiceCallTimeEntryDto {
  id: string;
  date: string;
  employeeName: string;
  taskLabel: string | null;
  roundedMinutes: number | null;
  status: string;
}

export interface ServiceCallTotalsDto {
  laborHours: number;
  laborCost?: number;
  laborSale?: number;
  partsCost?: number;
  partsSale?: number;
  expenses?: number;
  totalCost?: number;
  totalSale?: number;
}

/** Vue dossier (Call) — en-tête + liste de ses Bons de travail, jamais de prix ici (voir BonDeTravailDetailDto pour les totaux). */
export interface BonDeTravailSummaryDto {
  id: string;
  displayId: string;
  scheduledAt: string | null;
  assignedEmployees: AssignedEmployeeDto[];
  signatureCaptured: boolean;
  approved: boolean;
  invoicePlanEntryId: string | null;
  invoiceNumber: string | null;
  createdAt: string;
}

export interface ServiceCallDetailDto {
  id: string;
  displayId: string;
  derivedStatus: ServiceCallDerivedStatus;
  contactId: string;
  contactName: string;
  company: string | null;
  contactPhone: string | null;
  contactEmail: string | null;
  projectId: string | null;
  rollingId: string | null;
  title: string;
  request: string;
  address: string | null;
  assignedEmployees: AssignedEmployeeDto[];
  bonsDeTravail: BonDeTravailSummaryDto[];
  createdAt: string;
}

async function loadServiceCallOrThrow(id: string) {
  const call = await prisma.serviceCall.findUnique({
    where: { id },
    include: {
      contact: true,
      assignedEmployees: { select: { id: true, name: true } },
      bonsDeTravail: {
        where: { deletedAt: null },
        include: {
          assignedEmployees: { select: { id: true, name: true } },
          invoicePlanEntry: { select: { invoiceNumber: true } },
        },
        orderBy: { createdAt: "asc" },
      },
    },
  });
  if (!call || call.deletedAt) throw new HttpError(404, "Call de service introuvable.");
  return call;
}

export async function getServiceCallDetail(id: string): Promise<ServiceCallDetailDto> {
  const call = await loadServiceCallOrThrow(id);
  return {
    id: call.id,
    displayId: call.displayId,
    derivedStatus: deriveServiceCallStatus(call.bonsDeTravail),
    contactId: call.contactId,
    contactName: call.contact.name,
    company: call.contact.company,
    contactPhone: call.contact.phone,
    contactEmail: call.contact.email,
    projectId: call.projectId,
    rollingId: call.rollingId,
    title: serviceCallDisplayTitle(call),
    request: call.request,
    address: call.address,
    assignedEmployees: call.assignedEmployees,
    bonsDeTravail: call.bonsDeTravail.map((bt) => ({
      id: bt.id,
      displayId: bt.displayId,
      scheduledAt: bt.scheduledAt?.toISOString() ?? null,
      assignedEmployees: bt.assignedEmployees,
      signatureCaptured: bt.signatureCaptured,
      approved: bt.ownerApprovedAt !== null,
      invoicePlanEntryId: bt.invoicePlanEntryId,
      invoiceNumber: bt.invoicePlanEntry?.invoiceNumber ?? null,
      createdAt: bt.createdAt.toISOString(),
    })),
    createdAt: call.createdAt.toISOString(),
  };
}

export interface ServiceCallFinancialSummaryDto {
  id: string;
  displayId: string;
  title: string;
  company: string | null;
  contactName: string;
  totalCost: number;
  totalSale: number;
  laborHours: number;
}

/**
 * Agrégé sur TOUS les Bons de travail (non supprimés) du Call — pour les
 * Rapports (comparatif de rentabilité, reports/service.ts), qui ont besoin
 * du coût ET du revenu totaux du dossier, contrairement à listServiceCalls
 * qui n'a besoin que du prix de vente pour son filtre. Remplace l'ancien
 * appel à getServiceCallDetail (Chantier D — ce DTO n'a plus de totaux,
 * voir plus haut) sans dupliquer le calcul : même computeBonDeTravailFinancials.
 */
export async function getServiceCallFinancialSummary(id: string): Promise<ServiceCallFinancialSummaryDto> {
  const call = await prisma.serviceCall.findUnique({
    where: { id },
    include: {
      contact: { select: { name: true, company: true } },
      bonsDeTravail: {
        where: { deletedAt: null },
        include: {
          timeEntries: { where: { deletedAt: null }, include: { task: { select: { specificServiceRate: true } } } },
          parts: true,
        },
      },
    },
  });
  if (!call || call.deletedAt) throw new HttpError(404, "Call de service introuvable.");
  let totalCost = 0;
  let totalSale = 0;
  let laborHours = 0;
  for (const bt of call.bonsDeTravail) {
    const financials = await computeBonDeTravailFinancials(bt);
    totalCost += financials.totalCost;
    totalSale += financials.totalSale;
    laborHours += financials.laborHours;
  }
  return {
    id: call.id,
    displayId: call.displayId,
    title: serviceCallDisplayTitle(call),
    company: call.contact.company,
    contactName: call.contact.name,
    totalCost: Math.round(totalCost * 100) / 100,
    totalSale: Math.round(totalSale * 100) / 100,
    laborHours: Math.round(laborHours * 100) / 100,
  };
}

export interface UpdateServiceCallInput {
  /** Qui est censé s'occuper du dossier — seul champ encore modifiable au niveau du Call (tout le reste a déménagé vers BonDeTravail). */
  assignedEmployeeIds?: string[];
}

export async function updateServiceCall(id: string, patch: UpdateServiceCallInput): Promise<void> {
  const call = await prisma.serviceCall.findUnique({ where: { id } });
  if (!call || call.deletedAt) throw new HttpError(404, "Call de service introuvable.");
  if (patch.assignedEmployeeIds === undefined) return;
  await prisma.serviceCall.update({
    where: { id },
    data: { assignedEmployees: { set: patch.assignedEmployeeIds.map((employeeId) => ({ id: employeeId })) } },
  });
}

// ---------------------------------------------------------------------------
// Bons de travail
// ---------------------------------------------------------------------------

async function loadBonDeTravailOrThrow(id: string) {
  const bt = await prisma.bonDeTravail.findUnique({
    where: { id },
    include: {
      serviceCall: { include: { contact: true } },
      parts: true,
      photos: true,
      assignedEmployees: { select: { id: true, name: true } },
      timeEntries: { where: { deletedAt: null }, include: { employee: true, task: true }, orderBy: { startAt: "desc" } },
      invoicePlanEntry: { select: { invoiceNumber: true } },
    },
  });
  if (!bt || bt.deletedAt) throw new HttpError(404, "Bon de travail introuvable.");
  return bt;
}

/** Un Bon de travail déjà facturé est figé — même principe qu'une facture envoyée partout ailleurs dans l'appli. */
function assertBonDeTravailEditable(bt: { invoicePlanEntryId: string | null }): void {
  if (bt.invoicePlanEntryId) throw new HttpError(409, "Ce bon de travail est déjà facturé et ne peut plus être modifié.");
}

export interface CreateBonDeTravailInput {
  /** Qui est réellement allé sur ce déplacement — défaut : le créateur lui-même si c'est un technicien (voir routes.ts). */
  assignedEmployeeIds?: string[];
  scheduledAt?: string;
}

export async function createBonDeTravail(serviceCallId: string, creatorId: string, input: CreateBonDeTravailInput): Promise<{ id: string; displayId: string }> {
  const call = await prisma.serviceCall.findUnique({ where: { id: serviceCallId } });
  if (!call || call.deletedAt) throw new HttpError(404, "Call de service introuvable.");

  return prisma.$transaction(async (tx) => {
    const settings = await tx.settings.findFirst();
    if (!settings) throw new HttpError(500, "Paramètres non initialisés — lancer le seed.");
    const { year, number } = resolveNextBonDeTravailNumber(settings);
    const displayId = `BT-${year}-${String(number).padStart(4, "0")}`;
    const bt = await tx.bonDeTravail.create({
      data: {
        displayId,
        serviceCallId,
        createdById: creatorId,
        assignedEmployees: input.assignedEmployeeIds?.length ? { connect: input.assignedEmployeeIds.map((id) => ({ id })) } : undefined,
        scheduledAt: input.scheduledAt ? new Date(input.scheduledAt) : null,
      },
    });
    await tx.settings.update({ where: { id: settings.id }, data: { nextBonDeTravailNumber: number + 1, bonDeTravailNumberYear: year } });
    return { id: bt.id, displayId: bt.displayId };
  });
}

export interface UpdateBonDeTravailInput {
  assignedEmployeeIds?: string[];
  scheduledAt?: string | null;
  kmTraveled?: number | null;
  mealsBreakfastCount?: number;
  mealsLunchCount?: number;
  mealsDinnerCount?: number;
  summary?: string | null;
}

export async function updateBonDeTravail(id: string, patch: UpdateBonDeTravailInput): Promise<void> {
  const bt = await loadBonDeTravailOrThrow(id);
  assertBonDeTravailEditable(bt);
  const data: Prisma.BonDeTravailUncheckedUpdateInput = {};
  if (patch.assignedEmployeeIds !== undefined) data.assignedEmployees = { set: patch.assignedEmployeeIds.map((employeeId) => ({ id: employeeId })) };
  if (patch.scheduledAt !== undefined) data.scheduledAt = patch.scheduledAt ? new Date(patch.scheduledAt) : null;
  if (patch.kmTraveled !== undefined) data.kmTraveled = patch.kmTraveled;
  if (patch.mealsBreakfastCount !== undefined) data.mealsBreakfastCount = patch.mealsBreakfastCount;
  if (patch.mealsLunchCount !== undefined) data.mealsLunchCount = patch.mealsLunchCount;
  if (patch.mealsDinnerCount !== undefined) data.mealsDinnerCount = patch.mealsDinnerCount;
  if (patch.summary !== undefined) data.summary = patch.summary;
  await prisma.bonDeTravail.update({ where: { id }, data });
}

export interface AddServiceCallPartInput {
  name: string;
  qty: number;
  unit?: string;
}

export async function addServiceCallPart(bonDeTravailId: string, input: AddServiceCallPartInput): Promise<ServiceCallPartDto> {
  const bt = await loadBonDeTravailOrThrow(bonDeTravailId);
  assertBonDeTravailEditable(bt);
  if (!input.name?.trim()) throw new HttpError(400, "Le nom de la pièce est requis.");
  if (!(input.qty > 0)) throw new HttpError(400, "La quantité doit être positive.");
  const part = await prisma.serviceCallPart.create({
    data: { bonDeTravailId, name: input.name.trim(), qty: input.qty, unit: input.unit || null },
  });
  return toPartDto(part);
}

export async function removeServiceCallPart(partId: string): Promise<void> {
  const part = await prisma.serviceCallPart.findUnique({ where: { id: partId }, include: { bonDeTravail: true } });
  if (!part) throw new HttpError(404, "Pièce introuvable.");
  assertBonDeTravailEditable(part.bonDeTravail);
  await prisma.serviceCallPart.delete({ where: { id: partId } });
}

export interface PriceServiceCallPartInput {
  costPerUnit: number;
  marginPctOverride?: number;
}

/** Direction seulement (canPriceServiceParts) — vérifié au niveau de la route. */
export async function priceServiceCallPart(partId: string, pricedById: string, input: PriceServiceCallPartInput): Promise<ServiceCallPartDto> {
  const part = await prisma.serviceCallPart.findUnique({ where: { id: partId }, include: { bonDeTravail: true } });
  if (!part) throw new HttpError(404, "Pièce introuvable.");
  assertBonDeTravailEditable(part.bonDeTravail);
  if (!(input.costPerUnit >= 0)) throw new HttpError(400, "Le coût doit être positif ou nul.");

  const settings = await prisma.settings.findFirst();
  if (!settings) throw new HttpError(500, "Paramètres non initialisés — lancer le seed.");
  const marginPct = input.marginPctOverride ?? part.bonDeTravail.partPricingMarginPctOverride ?? Number(settings.servicePartsDefaultMarginPct);
  const salePricePerUnit = saleFromCost(input.costPerUnit, Number(marginPct));

  const updated = await prisma.serviceCallPart.update({
    where: { id: partId },
    data: {
      costPerUnit: input.costPerUnit,
      marginPctOverride: input.marginPctOverride ?? null,
      salePricePerUnit,
      pricedById,
      pricedAt: new Date(),
    },
  });
  return toPartDto(updated);
}

/**
 * Data URL (image/png;base64,...) — capturée à l'écran, aucun stockage de
 * fichiers réel cette passe. Nom du signataire obligatoire (20 août 2026).
 */
export async function captureBonDeTravailSignature(id: string, dataUrl: string, signerName: string): Promise<void> {
  const bt = await loadBonDeTravailOrThrow(id);
  assertBonDeTravailEditable(bt);
  if (!dataUrl?.startsWith("data:image/")) throw new HttpError(400, "Signature invalide.");
  if (!signerName?.trim()) throw new HttpError(400, "Le nom du signataire est requis.");
  await prisma.bonDeTravail.update({
    where: { id },
    data: { signatureCaptured: true, signatureImageUrl: dataUrl, signatureSignerName: signerName.trim() },
  });
}

/** Direction seulement (canApproveServiceCall) — exige résumé + signature déjà faits (cycle confirmé), rescopé au Bon de travail. */
export async function approveBonDeTravail(id: string, approverId: string): Promise<void> {
  const bt = await loadBonDeTravailOrThrow(id);
  if (!bt.summary?.trim()) throw new HttpError(400, "Le résumé est requis avant l'approbation.");
  if (!bt.signatureCaptured) throw new HttpError(400, "La signature du client est requise avant l'approbation.");
  if (bt.ownerApprovedAt) throw new HttpError(409, "Ce bon de travail est déjà approuvé.");
  await prisma.bonDeTravail.update({
    where: { id },
    data: { ownerApprovedById: approverId, ownerApprovedAt: new Date() },
  });
}

/**
 * Totaux financiers réels d'un Bon de travail — même calcul que
 * bonDeTravailSaleTotal (listServiceCalls) mais retourne le détail complet
 * (coût ET vente par poste), nécessaire pour l'affichage interactif et la
 * facturation sélective. Jamais dupliqué : les deux partagent
 * serviceCallLaborTotals/serviceCallExpenseTotal (business-rules).
 */
async function computeBonDeTravailFinancials(bt: BonDeTravailFinancialsInput): Promise<{
  laborHours: number;
  laborCost: number;
  laborSale: number;
  partsCost: number;
  partsSale: number;
  expenses: number;
  totalCost: number;
  totalSale: number;
}> {
  const settings = await prisma.settings.findFirst();
  if (!settings) throw new HttpError(500, "Paramètres non initialisés — lancer le seed.");
  const techLevelIds = [...new Set(bt.timeEntries.map((entry) => entry.techLevelId).filter((id): id is string => !!id))];
  const techLevels = await prisma.techLevel.findMany({ where: { id: { in: techLevelIds } } });
  const techLevelsById = Object.fromEntries(
    techLevels.map((techLevel) => [
      techLevel.id,
      { regularRate: Number(techLevel.regularRate), overtimeRate: Number(techLevel.overtimeRate), extraRate: Number(techLevel.extraRate) },
    ]),
  );
  const labor = serviceCallLaborTotals(
    bt.timeEntries.map((entry) => ({
      status: entry.status,
      roundedMinutes: entry.roundedMinutes,
      costRate: Number(entry.costRate),
      techLevelId: entry.techLevelId,
      rateType: entry.rateType,
      specificRate: entry.task?.specificServiceRate !== null && entry.task?.specificServiceRate !== undefined
        ? Number(entry.task.specificServiceRate)
        : null,
    })),
    techLevelsById,
  );
  const pricedParts = bt.parts.filter((part) => part.costPerUnit !== null);
  const partsCost = pricedParts.reduce((sum, part) => sum + Number(part.costPerUnit) * Number(part.qty), 0);
  const partsSale = pricedParts.reduce((sum, part) => sum + Number(part.salePricePerUnit ?? 0) * Number(part.qty), 0);
  const expenses = serviceCallExpenseTotal(
    bt.kmTraveled !== null ? Number(bt.kmTraveled) : null,
    { mealsBreakfastCount: bt.mealsBreakfastCount, mealsLunchCount: bt.mealsLunchCount, mealsDinnerCount: bt.mealsDinnerCount },
    {
      mileageRate: Number(settings.mileageRate),
      breakfastRate: Number(settings.breakfastRate),
      lunchRate: Number(settings.lunchRate),
      dinnerRate: Number(settings.dinnerRate),
    },
  );
  return {
    laborHours: labor.hours,
    laborCost: labor.cost,
    laborSale: labor.sale,
    partsCost: Math.round(partsCost * 100) / 100,
    partsSale: Math.round(partsSale * 100) / 100,
    expenses,
    totalCost: Math.round((labor.cost + partsCost + expenses) * 100) / 100,
    totalSale: Math.round((labor.sale + partsSale + expenses) * 100) / 100,
  };
}

export interface BonDeTravailDetailDto {
  id: string;
  displayId: string;
  serviceCallId: string;
  serviceCallDisplayId: string;
  serviceCallTitle: string;
  contactName: string;
  company: string | null;
  assignedEmployees: AssignedEmployeeDto[];
  scheduledAt: string | null;
  startAt: string | null;
  endAt: string | null;
  kmTraveled: number | null;
  mealsBreakfastCount: number;
  mealsLunchCount: number;
  mealsDinnerCount: number;
  summary: string | null;
  signatureCaptured: boolean;
  signatureImageUrl: string | null;
  signatureSignerName: string | null;
  ownerApprovedByName: string | null;
  ownerApprovedAt: string | null;
  invoicePlanEntryId: string | null;
  invoiceNumber: string | null;
  parts: ServiceCallPartDto[];
  photos: ServiceCallPhotoDto[];
  timeEntries: ServiceCallTimeEntryDto[];
  totals: ServiceCallTotalsDto;
  createdAt: string;
}

export async function getBonDeTravailDetail(id: string, viewerPersona: Persona): Promise<BonDeTravailDetailDto> {
  const bt = await loadBonDeTravailOrThrow(id);
  const showFinancials = canSeeServicePricing(viewerPersona);

  const approvedByEmployee = bt.ownerApprovedById
    ? await prisma.employee.findUnique({ where: { id: bt.ownerApprovedById }, select: { name: true } })
    : null;

  const totals: ServiceCallTotalsDto = { laborHours: 0 };
  if (showFinancials) {
    const financials = await computeBonDeTravailFinancials(bt);
    totals.laborHours = financials.laborHours;
    totals.laborCost = financials.laborCost;
    totals.laborSale = financials.laborSale;
    totals.partsCost = financials.partsCost;
    totals.partsSale = financials.partsSale;
    totals.expenses = financials.expenses;
    totals.totalCost = financials.totalCost;
    totals.totalSale = financials.totalSale;
  } else {
    totals.laborHours = serviceCallLaborTotals(
      bt.timeEntries.map((entry) => ({ status: entry.status, roundedMinutes: entry.roundedMinutes })),
      {},
    ).hours;
  }

  return {
    id: bt.id,
    displayId: bt.displayId,
    serviceCallId: bt.serviceCallId,
    serviceCallDisplayId: bt.serviceCall.displayId,
    serviceCallTitle: serviceCallDisplayTitle(bt.serviceCall),
    contactName: bt.serviceCall.contact.name,
    company: bt.serviceCall.contact.company,
    assignedEmployees: bt.assignedEmployees,
    scheduledAt: bt.scheduledAt?.toISOString() ?? null,
    startAt: bt.startAt?.toISOString() ?? null,
    endAt: bt.endAt?.toISOString() ?? null,
    kmTraveled: bt.kmTraveled !== null ? Number(bt.kmTraveled) : null,
    mealsBreakfastCount: bt.mealsBreakfastCount,
    mealsLunchCount: bt.mealsLunchCount,
    mealsDinnerCount: bt.mealsDinnerCount,
    summary: bt.summary,
    signatureCaptured: bt.signatureCaptured,
    signatureImageUrl: bt.signatureImageUrl,
    signatureSignerName: bt.signatureSignerName,
    ownerApprovedByName: approvedByEmployee?.name ?? null,
    ownerApprovedAt: bt.ownerApprovedAt?.toISOString() ?? null,
    invoicePlanEntryId: bt.invoicePlanEntryId,
    invoiceNumber: bt.invoicePlanEntry?.invoiceNumber ?? null,
    parts: bt.parts.map(toPartDto),
    photos: bt.photos.map(toPhotoDto),
    timeEntries: bt.timeEntries.map((entry) => ({
      id: entry.id,
      date: entry.date.toISOString().slice(0, 10),
      employeeName: entry.employee.name,
      taskLabel: entry.task?.label ?? null,
      roundedMinutes: entry.roundedMinutes,
      status: entry.status,
    })),
    totals,
    createdAt: bt.createdAt.toISOString(),
  };
}

// ---------------------------------------------------------------------------
// Facturation sélective (Chantier D) — remplace sendServiceCallToAdmin
// ---------------------------------------------------------------------------

/** Un call lié à un projet/roulement reste non-facturable séparément — même garde qu'avant, au niveau du Call plutôt que par Bon de travail. */
function assertServiceCallBillable(call: { projectId: string | null; rollingId: string | null }): void {
  if (call.projectId) throw new HttpError(400, "Ce call est lié à un projet (sous-garantie) — il ne peut pas être facturé séparément.");
  if (call.rollingId) throw new HttpError(400, "Ce call est lié à un roulement — il ne peut pas être facturé séparément.");
}

export interface InvoiceableBonDeTravailDto {
  id: string;
  displayId: string;
  scheduledAt: string | null;
  amount: number;
}

/** Bons de travail approuvés, pas encore facturés, d'un Call — ce que Marie choisit parmi pour composer une facture. */
export async function listInvoiceableBonsDeTravail(serviceCallId: string): Promise<InvoiceableBonDeTravailDto[]> {
  const call = await prisma.serviceCall.findUnique({ where: { id: serviceCallId } });
  if (!call || call.deletedAt) throw new HttpError(404, "Call de service introuvable.");
  const bts = await prisma.bonDeTravail.findMany({
    where: { serviceCallId, deletedAt: null, ownerApprovedAt: { not: null }, invoicePlanEntryId: null },
    include: { timeEntries: { where: { deletedAt: null }, include: { task: { select: { specificServiceRate: true } } } }, parts: true },
    orderBy: { createdAt: "asc" },
  });
  const results: InvoiceableBonDeTravailDto[] = [];
  for (const bt of bts) {
    const financials = await computeBonDeTravailFinancials(bt);
    results.push({ id: bt.id, displayId: bt.displayId, scheduledAt: bt.scheduledAt?.toISOString() ?? null, amount: financials.totalSale });
  }
  return results;
}

async function assertBonsDeTravailSelectable(serviceCallId: string, bonDeTravailIds: string[]) {
  if (bonDeTravailIds.length === 0) throw new HttpError(400, "Sélectionner au moins un bon de travail.");
  const bts = await prisma.bonDeTravail.findMany({
    where: { id: { in: bonDeTravailIds } },
    include: { timeEntries: { where: { deletedAt: null }, include: { task: { select: { specificServiceRate: true } } } }, parts: true },
  });
  if (bts.length !== bonDeTravailIds.length) throw new HttpError(404, "Un ou plusieurs bons de travail sont introuvables.");
  for (const bt of bts) {
    if (bt.serviceCallId !== serviceCallId) throw new HttpError(400, "Un bon de travail sélectionné n'appartient pas à ce call.");
    if (bt.deletedAt) throw new HttpError(400, "Un bon de travail sélectionné est dans la corbeille.");
    if (!bt.ownerApprovedAt) throw new HttpError(400, "Un bon de travail sélectionné n'est pas encore approuvé.");
    if (bt.invoicePlanEntryId) throw new HttpError(409, "Un bon de travail sélectionné est déjà facturé.");
  }
  return bts;
}

async function sumSelectedTotalSale(bts: Awaited<ReturnType<typeof assertBonsDeTravailSelectable>>): Promise<number> {
  let total = 0;
  for (const bt of bts) total += (await computeBonDeTravailFinancials(bt)).totalSale;
  return Math.round(total * 100) / 100;
}

/** Aperçu avant confirmation (RequestInvoiceModal) — même rôle que previewInvoiceRequest (projects/service.ts) mais sans InvoicePlanEntry encore créée. */
export async function previewServiceCallInvoiceForSelection(serviceCallId: string, bonDeTravailIds: string[]): Promise<InvoiceRequestPreviewDto> {
  const call = await prisma.serviceCall.findUnique({ where: { id: serviceCallId } });
  if (!call || call.deletedAt) throw new HttpError(404, "Call de service introuvable.");
  assertServiceCallBillable(call);
  const bts = await assertBonsDeTravailSelectable(serviceCallId, bonDeTravailIds);
  return buildInvoiceRequestPreview(await sumSelectedTotalSale(bts));
}

/**
 * Facturation sélective (16 novembre 2026, remplace sendServiceCallToAdmin) :
 * Marie choisit LESQUELS des Bons de travail approuvés pas encore facturés
 * vont sur une même facture — plusieurs factures distinctes peuvent donc
 * exister pour un même Call au fil du temps, chacune figée une fois envoyée.
 * Crée ET confirme (numéro/taxes/échéance) dans la MÊME transaction, exactement
 * comme avant — toujours aucun état intermédiaire "créé mais sans numéro".
 */
export async function createServiceCallInvoiceForSelection(
  serviceCallId: string,
  bonDeTravailIds: string[],
  actorId: string,
  note?: string,
): Promise<InvoicePlanEntryDto> {
  const call = await prisma.serviceCall.findUnique({ where: { id: serviceCallId } });
  if (!call || call.deletedAt) throw new HttpError(404, "Call de service introuvable.");
  assertServiceCallBillable(call);
  const bts = await assertBonsDeTravailSelectable(serviceCallId, bonDeTravailIds);
  const total = await sumSelectedTotalSale(bts);
  const label = `${call.displayId} — ${bts.map((bt) => bt.displayId).join(", ")}`;

  return prisma.$transaction(async (tx) => {
    const entry = await tx.invoicePlanEntry.create({
      data: { serviceCallId, label, pct: 100, amount: total, sortOrder: 0 },
    });
    await tx.bonDeTravail.updateMany({ where: { id: { in: bonDeTravailIds } }, data: { invoicePlanEntryId: entry.id } });
    return confirmInvoiceRequestInTx(tx, entry.id, actorId, { note });
  });
}

/** Corbeille — même mécanisme que deleteClientRequest/deleteBudget/deleteProject (19 août 2026). */
export async function deleteServiceCall(id: string): Promise<void> {
  const call = await prisma.serviceCall.findUnique({ where: { id } });
  if (!call) throw new HttpError(404, "Appel de service introuvable.");
  if (call.deletedAt) throw new HttpError(400, "Cet appel de service est déjà dans la corbeille.");
  await prisma.serviceCall.update({ where: { id }, data: { deletedAt: new Date() } });
}
