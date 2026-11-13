/**
 * GSC Pilot — Facturation, vue consolidée (20 août 2026)
 *
 * Regroupe dans un seul écran les jalons de facturation déjà DEMANDÉS
 * (projets/roulements, via le geste unifié "Demander la facturation" —
 * confirmInvoiceRequest, projects/service.ts), les appels de service
 * envoyés à l'administration (sendServiceCallToAdmin, serviceCalls/
 * service.ts) et les ventes externes terminées (requestExternalSaleInvoice,
 * externalSales/service.ts) — les 3 derniers créent ET confirment leur
 * jalon à 100 % dans la même transaction depuis le 13 novembre 2026. Un
 * jalon de projet jamais demandé reste invisible ici — visible seulement
 * dans le Cycle de facturation du projet lui-même (comportement voulu).
 *
 * Réutilise entièrement invoiceStatus (billing.ts) pour le statut calculé
 * — aucune nouvelle règle ici, seulement l'agrégation cross-dossier. Les
 * actions elles-mêmes (confirmer/annuler/paiement) restent les fonctions
 * déjà vérifiées de projects/service.ts — jamais réimplémentées.
 */
import { invoiceStatus, type InvoiceLike } from "@gsc-pilot/business-rules";
import { prisma } from "../../db.js";
import { serviceCallDisplayTitle } from "../serviceCalls/service.js";

export interface InvoiceEntryDto {
  id: string;
  label: string;
  pct: number;
  amount: number;
  status: "pending" | "sent" | "paid" | "on_hold" | "overdue";
  invoiceNumber: string | null;
  dueDate: string | null;
  tpsAmount: number | null;
  tvqAmount: number | null;
  totalWithTax: number | null;
  note: string | null;
  paidAmount: number;
  paidAt: string | null;
  isExtra: boolean;
  requestedAt: string | null;
  processedAt: string | null;
  sourceType: "project" | "rolling" | "serviceCall" | "externalSale";
  sourceLabel: string;
  clientLabel: string;
  /** Dossier d'origine à la corbeille (10 novembre 2026) — seul cas où deleteInvoicePlanEntry (projects/service.ts) accepte de supprimer la ligne. */
  sourceDeleted: boolean;
}

/** include Prisma partagé par listInvoiceEntries ci-dessous et listPendingInvoiceEntriesForForecast (treasury/service.ts) — un seul endroit à tenir à jour. */
export const INVOICE_ENTRY_SOURCE_INCLUDE = {
  project: { include: { contact: { select: { name: true, company: true } } } },
  rolling: { include: { contact: { select: { name: true, company: true } } } },
  serviceCall: { include: { contact: { select: { name: true, company: true } } } },
  externalSale: { include: { contact: { select: { name: true, company: true } } } },
} as const;

export interface InvoiceEntrySourceInfo {
  sourceType: InvoiceEntryDto["sourceType"];
  sourceLabel: string;
  clientLabel: string;
  sourceDeleted: boolean;
  // Date de livraison prévue du dossier parent (fulfillmentScheduled pour
  // Project/Rolling/ExternalSale, scheduledAt pour ServiceCall) — ancrage
  // par défaut du prévisionnel (module Trésorerie, 13 novembre 2026) pour
  // un jalon encore pending. Toujours lue même si le jalon est déjà
  // confirmé (listInvoiceEntries ne s'en sert pas, mais la resolution reste
  // la même pour les 2 appelants — un seul point de vérité).
  parentScheduledDate: Date | null;
}

type ContactLike = { name: string; company: string | null };

/**
 * Résout le dossier d'origine (projet/roulement/call/vente externe) d'une
 * InvoicePlanEntry — extrait le 13 novembre 2026 (module Trésorerie en a
 * besoin aussi, pour le prévisionnel des jalons pas encore facturés) pour
 * ne jamais dupliquer ce chaînage if/else une deuxième fois.
 */
export function resolveInvoiceEntrySource(row: {
  project: { projectNumber: string; name: string; deletedAt: Date | null; fulfillmentScheduled: Date | null; contact: ContactLike } | null;
  serviceCall: { displayId: string; title: string | null; request: string; deletedAt: Date | null; scheduledAt: Date | null; contact: ContactLike } | null;
  rolling: { rollingNumber: string; deletedAt: Date | null; fulfillmentScheduled: Date | null; contact: ContactLike } | null;
  externalSale: { displayId: string; deletedAt: Date | null; fulfillmentScheduled: Date | null; contact: ContactLike } | null;
}): InvoiceEntrySourceInfo {
  if (row.project) {
    return {
      sourceType: "project",
      sourceLabel: `${row.project.projectNumber} — ${row.project.name}`,
      clientLabel: row.project.contact.company ?? row.project.contact.name,
      sourceDeleted: row.project.deletedAt !== null,
      parentScheduledDate: row.project.fulfillmentScheduled,
    };
  }
  if (row.serviceCall) {
    return {
      sourceType: "serviceCall",
      sourceLabel: `${row.serviceCall.displayId} — ${serviceCallDisplayTitle(row.serviceCall)}`,
      clientLabel: row.serviceCall.contact.company ?? row.serviceCall.contact.name,
      sourceDeleted: row.serviceCall.deletedAt !== null,
      parentScheduledDate: row.serviceCall.scheduledAt,
    };
  }
  if (row.rolling) {
    return {
      sourceType: "rolling",
      sourceLabel: row.rolling.rollingNumber,
      clientLabel: row.rolling.contact.company ?? row.rolling.contact.name,
      sourceDeleted: row.rolling.deletedAt !== null,
      parentScheduledDate: row.rolling.fulfillmentScheduled,
    };
  }
  if (row.externalSale) {
    return {
      sourceType: "externalSale",
      sourceLabel: row.externalSale.displayId,
      clientLabel: row.externalSale.contact.company ?? row.externalSale.contact.name,
      sourceDeleted: row.externalSale.deletedAt !== null,
      parentScheduledDate: row.externalSale.fulfillmentScheduled,
    };
  }
  return { sourceType: "project", sourceLabel: "—", clientLabel: "—", sourceDeleted: false, parentScheduledDate: null };
}

export async function listInvoiceEntries(): Promise<InvoiceEntryDto[]> {
  const rows = await prisma.invoicePlanEntry.findMany({
    where: { requestedAt: { not: null } },
    include: INVOICE_ENTRY_SOURCE_INCLUDE,
    orderBy: { requestedAt: "desc" },
  });

  return rows.map((row) => {
    const { sourceType, sourceLabel, clientLabel, sourceDeleted } = resolveInvoiceEntrySource(row);

    // totalWithTax ?? amount : même résolution tax-aware que toInvoicePlanEntryDto (projects/service.ts), 13 novembre 2026.
    const statusInput: InvoiceLike = {
      amount: Number(row.totalWithTax ?? row.amount),
      paid: Number(row.paidAmount),
      status: row.status,
      due: row.dueDate?.toISOString(),
    };

    return {
      id: row.id,
      label: row.label,
      pct: Number(row.pct),
      amount: Number(row.amount),
      status: invoiceStatus(statusInput),
      invoiceNumber: row.invoiceNumber,
      dueDate: row.dueDate?.toISOString() ?? null,
      tpsAmount: row.tpsAmount !== null ? Number(row.tpsAmount) : null,
      tvqAmount: row.tvqAmount !== null ? Number(row.tvqAmount) : null,
      totalWithTax: row.totalWithTax !== null ? Number(row.totalWithTax) : null,
      note: row.note,
      paidAmount: Number(row.paidAmount),
      paidAt: row.paidAt?.toISOString() ?? null,
      isExtra: row.isExtra,
      requestedAt: row.requestedAt?.toISOString() ?? null,
      processedAt: row.processedAt?.toISOString() ?? null,
      sourceType,
      sourceLabel,
      clientLabel,
      sourceDeleted,
    };
  });
}
