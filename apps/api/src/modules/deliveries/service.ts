/**
 * GSC Pilot — Livraisons (20 août 2026)
 *
 * Delivery (schéma) était déjà créé par chooseProjectFulfillmentMode (mode
 * "warehouse", voir projects/service.ts) au moment où Direction/Administration
 * choisit le Bon de livraison — mais rien ne le lisait ni ne le confirmait
 * nulle part. Ce module comble exactement ce trou.
 *
 * La confirmation met à jour DEUX enregistrements dans la même transaction :
 * la livraison elle-même (signature, complétée) et le projet lié
 * (confirmWarehouseDelivery, fulfillment.ts — jamais réimplémenté), exactement
 * comme confirmFulfillment le fait déjà pour les modes tiers/ramassage depuis
 * la fiche projet (voir en-tête de fulfillment.ts : "warehouse ... se
 * confirme via le Bon de livraison lui-même").
 */
import { confirmWarehouseDelivery, type Persona, type FulfillmentMode } from "@gsc-pilot/business-rules";
import { prisma } from "../../db.js";
import { HttpError } from "../../middleware/errorHandler.js";
import type { Prisma } from "../../generated/prisma/client.js";

export interface DeliveryListItemDto {
  id: string;
  displayId: string;
  status: string;
  contactName: string;
  company: string | null;
  address: string | null;
  scheduledAt: string | null;
  driverEmployeeName: string | null;
  sourceLabel: string;
}

/**
 * driverEmployeeId est un simple scalaire, sans relation Prisma déclarée
 * (voir schema.prisma) — même patron que ServiceCall.ownerApprovedById :
 * résolution manuelle par lot, jamais un faux "include".
 */
async function driverNamesById(driverIds: (string | null)[]): Promise<Map<string, string>> {
  const ids = [...new Set(driverIds.filter((id): id is string => !!id))];
  if (ids.length === 0) return new Map();
  const employees = await prisma.employee.findMany({ where: { id: { in: ids } }, select: { id: true, name: true } });
  return new Map(employees.map((employee) => [employee.id, employee.name]));
}

/**
 * Direction/Administration/Propriétaire voient tout; Magasinier ET Employé
 * (2 septembre 2026 — le sélecteur de livreur, ProjectFulfillment.tsx/
 * RollingDetail.tsx, n'a jamais été restreint au Magasinier, voir
 * listPunchableEmployees) ne voient que leurs propres livraisons assignées
 * (canAccessDeliveries — même page).
 */
const OWN_DELIVERIES_ONLY: Persona[] = ["warehouse", "member"];
export async function listDeliveries(viewerPersona: Persona, viewerEmployeeId: string): Promise<DeliveryListItemDto[]> {
  const rows = await prisma.delivery.findMany({
    where: OWN_DELIVERIES_ONLY.includes(viewerPersona) ? { driverEmployeeId: viewerEmployeeId } : {},
    include: {
      contact: { select: { name: true, company: true } },
      project: { select: { projectNumber: true, name: true } },
      rolling: { select: { rollingNumber: true } },
    },
    orderBy: { createdAt: "desc" },
  });
  const namesById = await driverNamesById(rows.map((row) => row.driverEmployeeId));
  return rows.map((row) => ({
    id: row.id,
    displayId: row.displayId,
    status: row.status,
    contactName: row.contact.name,
    company: row.contact.company,
    address: row.address,
    scheduledAt: row.scheduledAt?.toISOString() ?? null,
    driverEmployeeName: row.driverEmployeeId ? (namesById.get(row.driverEmployeeId) ?? null) : null,
    sourceLabel: row.project ? `${row.project.projectNumber} — ${row.project.name}` : (row.rolling?.rollingNumber ?? "Roulement"),
  }));
}

async function loadDeliveryOrThrow(id: string) {
  const delivery = await prisma.delivery.findUnique({
    where: { id },
    include: { contact: true, project: { select: { projectNumber: true, name: true } }, rolling: { select: { rollingNumber: true } } },
  });
  if (!delivery) throw new HttpError(404, "Livraison introuvable.");
  return delivery;
}

export interface DeliveryDetailDto {
  id: string;
  displayId: string;
  status: string;
  contactName: string;
  company: string | null;
  contactPhone: string | null;
  address: string | null;
  scheduledAt: string | null;
  items: string | null;
  driverEmployeeName: string | null;
  signatureCaptured: boolean;
  signatureImageUrl: string | null;
  signatureSignerName: string | null;
  conditionNote: string | null;
  kmTraveled: number | null;
  completedAt: string | null;
  sourceLabel: string;
  createdAt: string;
}

export async function getDeliveryDetail(id: string): Promise<DeliveryDetailDto> {
  const delivery = await loadDeliveryOrThrow(id);
  const driverEmployee = delivery.driverEmployeeId
    ? await prisma.employee.findUnique({ where: { id: delivery.driverEmployeeId }, select: { name: true } })
    : null;
  return {
    id: delivery.id,
    displayId: delivery.displayId,
    status: delivery.status,
    contactName: delivery.contact.name,
    company: delivery.contact.company,
    contactPhone: delivery.contact.phone,
    address: delivery.address,
    scheduledAt: delivery.scheduledAt?.toISOString() ?? null,
    items: delivery.items,
    driverEmployeeName: driverEmployee?.name ?? null,
    signatureCaptured: delivery.signatureCaptured,
    signatureImageUrl: delivery.signatureImageUrl,
    signatureSignerName: delivery.signatureSignerName,
    conditionNote: delivery.conditionNote,
    kmTraveled: delivery.kmTraveled !== null ? Number(delivery.kmTraveled) : null,
    completedAt: delivery.completedAt?.toISOString() ?? null,
    sourceLabel: delivery.project ? `${delivery.project.projectNumber} — ${delivery.project.name}` : (delivery.rolling?.rollingNumber ?? "Roulement"),
    createdAt: delivery.createdAt.toISOString(),
  };
}

export interface UpdateDeliveryInput {
  items?: string | null;
  kmTraveled?: number | null;
  conditionNote?: string | null;
}

/** Données de terrain saisies avant (ou sans) confirmer — même principe que "Enregistrer les données terrain" des appels de service. */
export async function updateDelivery(id: string, patch: UpdateDeliveryInput): Promise<void> {
  await loadDeliveryOrThrow(id);
  const data: Prisma.DeliveryUncheckedUpdateInput = {};
  if (patch.items !== undefined) data.items = patch.items;
  if (patch.kmTraveled !== undefined) data.kmTraveled = patch.kmTraveled;
  if (patch.conditionNote !== undefined) data.conditionNote = patch.conditionNote;
  await prisma.delivery.update({ where: { id }, data });
}

/**
 * Signature captée → livraison complétée ET entité liée fermée
 * (confirmWarehouseDelivery, fulfillment.ts) — projet OU roulement, jamais
 * les deux (Delivery.type). Roulement ajouté le 21 août 2026 (module
 * Roulements) — jusque-là seul un projet lié était géré, un bon rattaché à
 * un roulement échouait toujours ici (delivery.projectId nul par
 * construction pour ce cas). La note de confirmation reprend le
 * conditionNote déjà saisi (updateDelivery), pas un champ séparé — même
 * donnée, jamais dupliquée. Déclaration + nom du signataire obligatoires
 * (31 août 2026, sur demande de l'utilisatrice) — même patron que
 * captureServiceCallSignature.
 */
export async function confirmDelivery(id: string, dataUrl: string, signerName: string): Promise<void> {
  const delivery = await loadDeliveryOrThrow(id);
  if (delivery.status === "completed") throw new HttpError(409, "Cette livraison est déjà confirmée.");
  if (!dataUrl?.startsWith("data:image/")) throw new HttpError(400, "Signature invalide.");
  if (!signerName?.trim()) throw new HttpError(400, "Le nom du signataire est requis.");
  if (!delivery.projectId && !delivery.rollingId) throw new HttpError(400, "Aucun projet ou roulement lié à cette livraison — confirmation impossible.");

  const deliveryUpdate = prisma.delivery.update({
    where: { id },
    data: { signatureCaptured: true, signatureImageUrl: dataUrl, signatureSignerName: signerName.trim(), status: "completed", completedAt: new Date() },
  });

  if (delivery.projectId) {
    const project = await prisma.project.findUnique({ where: { id: delivery.projectId } });
    if (!project) throw new HttpError(404, "Projet introuvable.");
    const updated = confirmWarehouseDelivery(
      {
        fulfillmentMode: (project.fulfillmentMode ?? undefined) as FulfillmentMode | undefined,
        billingReady: project.billingReady,
        fulfillmentStatus: project.fulfillmentStatus ?? undefined,
        status: project.status,
      },
      delivery.conditionNote ?? "",
    );
    await prisma.$transaction([
      deliveryUpdate,
      prisma.project.update({
        where: { id: delivery.projectId },
        data: {
          billingReady: updated.billingReady,
          fulfillmentStatus: updated.fulfillmentStatus,
          fulfillmentConfirmationNote: updated.fulfillmentConfirmationNote,
          status: updated.status,
        },
      }),
    ]);
    return;
  }

  const rolling = await prisma.rolling.findUnique({ where: { id: delivery.rollingId! } });
  if (!rolling) throw new HttpError(404, "Roulement introuvable.");
  const updated = confirmWarehouseDelivery(
    {
      fulfillmentMode: (rolling.fulfillmentMode ?? undefined) as FulfillmentMode | undefined,
      billingReady: rolling.billingReady,
      fulfillmentStatus: rolling.fulfillmentStatus ?? undefined,
      status: rolling.status,
    },
    delivery.conditionNote ?? "",
  );
  await prisma.$transaction([
    deliveryUpdate,
    prisma.rolling.update({
      where: { id: delivery.rollingId! },
      data: {
        billingReady: updated.billingReady,
        fulfillmentStatus: updated.fulfillmentStatus,
        fulfillmentConfirmationNote: updated.fulfillmentConfirmationNote,
        status: updated.status,
      },
    }),
  ]);
}
