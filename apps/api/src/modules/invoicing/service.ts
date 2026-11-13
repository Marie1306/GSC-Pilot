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

export async function listInvoiceEntries(): Promise<InvoiceEntryDto[]> {
  const rows = await prisma.invoicePlanEntry.findMany({
    where: { requestedAt: { not: null } },
    include: {
      project: { include: { contact: { select: { name: true, company: true } } } },
      rolling: { include: { contact: { select: { name: true, company: true } } } },
      serviceCall: { include: { contact: { select: { name: true, company: true } } } },
      externalSale: { include: { contact: { select: { name: true, company: true } } } },
    },
    orderBy: { requestedAt: "desc" },
  });

  return rows.map((row) => {
    let sourceType: InvoiceEntryDto["sourceType"] = "project";
    let sourceLabel = "—";
    let clientLabel = "—";
    let sourceDeleted = false;
    if (row.project) {
      sourceType = "project";
      sourceLabel = `${row.project.projectNumber} — ${row.project.name}`;
      clientLabel = row.project.contact.company ?? row.project.contact.name;
      sourceDeleted = row.project.deletedAt !== null;
    } else if (row.serviceCall) {
      sourceType = "serviceCall";
      sourceLabel = `${row.serviceCall.displayId} — ${serviceCallDisplayTitle(row.serviceCall)}`;
      clientLabel = row.serviceCall.contact.company ?? row.serviceCall.contact.name;
      sourceDeleted = row.serviceCall.deletedAt !== null;
    } else if (row.rolling) {
      sourceType = "rolling";
      sourceLabel = row.rolling.rollingNumber;
      clientLabel = row.rolling.contact.company ?? row.rolling.contact.name;
      sourceDeleted = row.rolling.deletedAt !== null;
    } else if (row.externalSale) {
      sourceType = "externalSale";
      sourceLabel = row.externalSale.displayId;
      clientLabel = row.externalSale.contact.company ?? row.externalSale.contact.name;
      sourceDeleted = row.externalSale.deletedAt !== null;
    }

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
