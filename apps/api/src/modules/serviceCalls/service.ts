/**
 * GSC Pilot — Appels de service (18-19 août 2026)
 *
 * Cycle confirmé (spécification, section « Appels de service — flux
 * complet ») : résumé obligatoire → signature client → approbation
 * Direction → envoi à Administration pour facturation. « Approuver » et
 * « Envoyer à l'administration » sont Direction seulement (canApproveServiceCall/
 * canSendServiceCallToAdmin, même porte que canRequestInvoice — écart
 * corrigé dans la vraie v19, jamais réintroduit ici).
 *
 * Plusieurs techniciens peuvent être assignés au même call (confirmé le
 * 19 août 2026 par l'utilisatrice — « ils doivent parfois y aller à deux
 * techniciens ») — ServiceCall.assignedEmployees, plusieurs-à-plusieurs.
 *
 * Pièces : coût réel = 0$ jusqu'à ce que la Direction tarife après coup
 * (texte libre saisi par le technicien) — confirmé, voir Rapports. Prix de
 * vente = saleFromCost (margin.ts), jamais réimplémenté.
 *
 * Signature : capturée comme une image (dataURL) directement dans
 * signatureImageUrl — aucune vraie infrastructure de stockage de fichiers
 * montée cette passe (portée, voir CLAUDE.md). Photos : structure exposée
 * en lecture seule, téléversement réel différé pour la même raison — non
 * utilisées durant la période de test selon la spécification, pas une
 * étape obligatoire du cycle.
 *
 * Courriel au client à l'approbation : différé (la spécification confirme
 * elle-même que ça ne fonctionnait pas dans le prototype sans serveur) —
 * seul le statut réel (ownerApprovedById/At) est géré ici.
 */
import { canSeeServicePricing, saleFromCost, serviceCallLaborTotals, serviceCallExpenseTotal, type Persona } from "@gsc-pilot/business-rules";
import { prisma } from "../../db.js";
import { HttpError } from "../../middleware/errorHandler.js";
import { ensureContactRow } from "../clientRequests/service.js";
import type { Prisma, ServiceCall, ServiceCallPart, ServiceCallPhoto } from "../../generated/prisma/client.js";

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
  request: string;
  assignedEmployeeIds?: string[];
  scheduledAt?: string;
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

export async function createServiceCall(input: CreateServiceCallInput): Promise<ServiceCall> {
  if (!input.request?.trim()) throw new HttpError(400, "La description de la demande est requise.");
  const contactId = await resolveContactId(input);

  return prisma.$transaction(async (tx) => {
    const settings = await tx.settings.findFirst();
    if (!settings) throw new HttpError(500, "Paramètres non initialisés — lancer le seed.");
    const displayId = `CS-${new Date().getFullYear()}-${String(settings.nextServiceCallNumber).padStart(4, "0")}`;
    const call = await tx.serviceCall.create({
      data: {
        displayId,
        contactId,
        request: input.request.trim(),
        assignedEmployees: input.assignedEmployeeIds?.length ? { connect: input.assignedEmployeeIds.map((id) => ({ id })) } : undefined,
        scheduledAt: input.scheduledAt ? new Date(input.scheduledAt) : null,
      },
    });
    await tx.settings.update({ where: { id: settings.id }, data: { nextServiceCallNumber: settings.nextServiceCallNumber + 1 } });
    return call;
  });
}

export interface AssignedEmployeeDto {
  id: string;
  name: string;
}

export interface ServiceCallListItemDto {
  id: string;
  displayId: string;
  status: string;
  contactName: string;
  company: string | null;
  request: string;
  assignedEmployees: AssignedEmployeeDto[];
  scheduledAt: string | null;
  createdAt: string;
}

export async function listServiceCalls(viewerPersona: Persona, viewerEmployeeId: string): Promise<ServiceCallListItemDto[]> {
  const calls = await prisma.serviceCall.findMany({
    where: viewerPersona === "member" ? { assignedEmployees: { some: { id: viewerEmployeeId } } } : {},
    include: { contact: { select: { name: true, company: true } }, assignedEmployees: { select: { id: true, name: true } } },
    orderBy: { createdAt: "desc" },
  });

  return calls.map((call) => ({
    id: call.id,
    displayId: call.displayId,
    status: call.status,
    contactName: call.contact.name,
    company: call.contact.company,
    request: call.request,
    assignedEmployees: call.assignedEmployees,
    scheduledAt: call.scheduledAt?.toISOString() ?? null,
    createdAt: call.createdAt.toISOString(),
  }));
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

export interface ServiceCallDetailDto {
  id: string;
  displayId: string;
  status: string;
  contactId: string;
  contactName: string;
  company: string | null;
  contactPhone: string | null;
  contactEmail: string | null;
  request: string;
  assignedEmployees: AssignedEmployeeDto[];
  scheduledAt: string | null;
  startAt: string | null;
  endAt: string | null;
  kmTraveled: number | null;
  mealsClaimed: string[];
  summary: string | null;
  signatureCaptured: boolean;
  signatureImageUrl: string | null;
  ownerApprovedByName: string | null;
  ownerApprovedAt: string | null;
  sentToAdminAt: string | null;
  parts: ServiceCallPartDto[];
  photos: ServiceCallPhotoDto[];
  timeEntries: ServiceCallTimeEntryDto[];
  totals: ServiceCallTotalsDto;
  createdAt: string;
}

async function loadServiceCallOrThrow(id: string) {
  const call = await prisma.serviceCall.findUnique({
    where: { id },
    include: {
      contact: true,
      parts: true,
      photos: true,
      assignedEmployees: { select: { id: true, name: true } },
      timeEntries: { include: { employee: true, task: true }, orderBy: { startAt: "desc" } },
    },
  });
  if (!call) throw new HttpError(404, "Call de service introuvable.");
  return call;
}

export async function getServiceCallDetail(id: string, viewerPersona: Persona): Promise<ServiceCallDetailDto> {
  const call = await loadServiceCallOrThrow(id);
  const showFinancials = canSeeServicePricing(viewerPersona);

  const approvedByEmployee = call.ownerApprovedById
    ? await prisma.employee.findUnique({ where: { id: call.ownerApprovedById }, select: { name: true } })
    : null;

  const totals: ServiceCallTotalsDto = { laborHours: 0 };
  if (showFinancials) {
    const settings = await prisma.settings.findFirst();
    if (!settings) throw new HttpError(500, "Paramètres non initialisés — lancer le seed.");
    const techLevelIds = [...new Set(call.timeEntries.map((entry) => entry.techLevelId).filter((id): id is string => !!id))];
    const techLevels = await prisma.techLevel.findMany({ where: { id: { in: techLevelIds } } });
    const techLevelsById = Object.fromEntries(
      techLevels.map((techLevel) => [
        techLevel.id,
        { regularRate: Number(techLevel.regularRate), overtimeRate: Number(techLevel.overtimeRate), extraRate: Number(techLevel.extraRate) },
      ]),
    );
    const labor = serviceCallLaborTotals(
      call.timeEntries.map((entry) => ({
        status: entry.status,
        roundedMinutes: entry.roundedMinutes,
        costRate: Number(entry.costRate),
        techLevelId: entry.techLevelId,
        rateType: entry.rateType,
      })),
      techLevelsById,
    );
    const pricedParts = call.parts.filter((part) => part.costPerUnit !== null);
    const partsCost = pricedParts.reduce((sum, part) => sum + Number(part.costPerUnit) * Number(part.qty), 0);
    const partsSale = pricedParts.reduce((sum, part) => sum + Number(part.salePricePerUnit ?? 0) * Number(part.qty), 0);
    const expenses = serviceCallExpenseTotal(call.kmTraveled ? Number(call.kmTraveled) : null, call.mealsClaimed, {
      mileageRate: Number(settings.mileageRate),
      breakfastRate: Number(settings.breakfastRate),
      lunchRate: Number(settings.lunchRate),
      dinnerRate: Number(settings.dinnerRate),
    });
    totals.laborHours = labor.hours;
    totals.laborCost = labor.cost;
    totals.laborSale = labor.sale;
    totals.partsCost = Math.round(partsCost * 100) / 100;
    totals.partsSale = Math.round(partsSale * 100) / 100;
    totals.expenses = expenses;
    totals.totalCost = Math.round((labor.cost + partsCost + expenses) * 100) / 100;
    totals.totalSale = Math.round((labor.sale + partsSale + expenses) * 100) / 100;
  } else {
    totals.laborHours = serviceCallLaborTotals(
      call.timeEntries.map((entry) => ({ status: entry.status, roundedMinutes: entry.roundedMinutes })),
      {},
    ).hours;
  }

  return {
    id: call.id,
    displayId: call.displayId,
    status: call.status,
    contactId: call.contactId,
    contactName: call.contact.name,
    company: call.contact.company,
    contactPhone: call.contact.phone,
    contactEmail: call.contact.email,
    request: call.request,
    assignedEmployees: call.assignedEmployees,
    scheduledAt: call.scheduledAt?.toISOString() ?? null,
    startAt: call.startAt?.toISOString() ?? null,
    endAt: call.endAt?.toISOString() ?? null,
    kmTraveled: call.kmTraveled !== null ? Number(call.kmTraveled) : null,
    mealsClaimed: call.mealsClaimed,
    summary: call.summary,
    signatureCaptured: call.signatureCaptured,
    signatureImageUrl: call.signatureImageUrl,
    ownerApprovedByName: approvedByEmployee?.name ?? null,
    ownerApprovedAt: call.ownerApprovedAt?.toISOString() ?? null,
    sentToAdminAt: call.sentToAdminAt?.toISOString() ?? null,
    parts: call.parts.map(toPartDto),
    photos: call.photos.map((photo: ServiceCallPhoto) => ({
      id: photo.id,
      storagePath: photo.storagePath,
      caption: photo.caption,
      uploadedAt: photo.uploadedAt.toISOString(),
    })),
    timeEntries: call.timeEntries.map((entry) => ({
      id: entry.id,
      date: entry.date.toISOString().slice(0, 10),
      employeeName: entry.employee.name,
      taskLabel: entry.task?.label ?? null,
      roundedMinutes: entry.roundedMinutes,
      status: entry.status,
    })),
    totals,
    createdAt: call.createdAt.toISOString(),
  };
}

export interface UpdateServiceCallInput {
  assignedEmployeeIds?: string[];
  scheduledAt?: string | null;
  kmTraveled?: number | null;
  mealsClaimed?: string[];
  summary?: string | null;
}

export async function updateServiceCall(id: string, patch: UpdateServiceCallInput): Promise<void> {
  await loadServiceCallOrThrow(id);
  const data: Prisma.ServiceCallUncheckedUpdateInput = {};
  if (patch.assignedEmployeeIds !== undefined) data.assignedEmployees = { set: patch.assignedEmployeeIds.map((employeeId) => ({ id: employeeId })) };
  if (patch.scheduledAt !== undefined) data.scheduledAt = patch.scheduledAt ? new Date(patch.scheduledAt) : null;
  if (patch.kmTraveled !== undefined) data.kmTraveled = patch.kmTraveled;
  if (patch.mealsClaimed !== undefined) data.mealsClaimed = patch.mealsClaimed;
  if (patch.summary !== undefined) data.summary = patch.summary;
  await prisma.serviceCall.update({ where: { id }, data });
}

export interface AddServiceCallPartInput {
  name: string;
  qty: number;
  unit?: string;
}

export async function addServiceCallPart(callId: string, input: AddServiceCallPartInput): Promise<ServiceCallPartDto> {
  await loadServiceCallOrThrow(callId);
  if (!input.name?.trim()) throw new HttpError(400, "Le nom de la pièce est requis.");
  if (!(input.qty > 0)) throw new HttpError(400, "La quantité doit être positive.");
  const part = await prisma.serviceCallPart.create({
    data: { serviceCallId: callId, name: input.name.trim(), qty: input.qty, unit: input.unit || null },
  });
  return toPartDto(part);
}

export async function removeServiceCallPart(partId: string): Promise<void> {
  const part = await prisma.serviceCallPart.findUnique({ where: { id: partId } });
  if (!part) throw new HttpError(404, "Pièce introuvable.");
  await prisma.serviceCallPart.delete({ where: { id: partId } });
}

export interface PriceServiceCallPartInput {
  costPerUnit: number;
  marginPctOverride?: number;
}

/** Direction seulement (canPriceServiceParts) — vérifié au niveau de la route. */
export async function priceServiceCallPart(partId: string, pricedById: string, input: PriceServiceCallPartInput): Promise<ServiceCallPartDto> {
  const part = await prisma.serviceCallPart.findUnique({ where: { id: partId }, include: { serviceCall: true } });
  if (!part) throw new HttpError(404, "Pièce introuvable.");
  if (!(input.costPerUnit >= 0)) throw new HttpError(400, "Le coût doit être positif ou nul.");

  const settings = await prisma.settings.findFirst();
  if (!settings) throw new HttpError(500, "Paramètres non initialisés — lancer le seed.");
  const marginPct = input.marginPctOverride ?? part.serviceCall.partPricingMarginPctOverride ?? Number(settings.servicePartsDefaultMarginPct);
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

/** Data URL (image/png;base64,...) — capturée à l'écran, aucun stockage de fichiers réel cette passe (voir en-tête). */
export async function captureServiceCallSignature(id: string, dataUrl: string): Promise<void> {
  await loadServiceCallOrThrow(id);
  if (!dataUrl?.startsWith("data:image/")) throw new HttpError(400, "Signature invalide.");
  await prisma.serviceCall.update({ where: { id }, data: { signatureCaptured: true, signatureImageUrl: dataUrl } });
}

/** Direction seulement (canApproveServiceCall) — exige résumé + signature déjà faits (cycle confirmé). */
export async function approveServiceCall(id: string, approverId: string): Promise<void> {
  const call = await loadServiceCallOrThrow(id);
  if (!call.summary?.trim()) throw new HttpError(400, "Le résumé est requis avant l'approbation.");
  if (!call.signatureCaptured) throw new HttpError(400, "La signature du client est requise avant l'approbation.");
  if (call.ownerApprovedAt) throw new HttpError(409, "Ce call est déjà approuvé.");
  await prisma.serviceCall.update({
    where: { id },
    data: { status: "approved", ownerApprovedById: approverId, ownerApprovedAt: new Date() },
  });
}

/** Direction seulement (canSendServiceCallToAdmin) — statut réel seulement, aucun courriel envoyé cette passe (voir en-tête). */
export async function sendServiceCallToAdmin(id: string): Promise<void> {
  const call = await loadServiceCallOrThrow(id);
  if (!call.ownerApprovedAt) throw new HttpError(400, "Le call doit d'abord être approuvé par la Direction.");
  if (call.sentToAdminAt) throw new HttpError(409, "Déjà envoyé à l'administration.");
  await prisma.serviceCall.update({ where: { id }, data: { sentToAdminAt: new Date() } });
}
