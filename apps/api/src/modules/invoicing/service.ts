/**
 * GSC Pilot — Facturation, vue consolidée (20 août 2026)
 *
 * Regroupe dans un seul écran les jalons de facturation déjà DEMANDÉS
 * (projets, via requestInvoice — voir projects/service.ts) et les appels
 * de service envoyés à l'administration (voir serviceCalls/service.ts,
 * sendServiceCallToAdmin, qui crée son propre jalon à 100 % au moment de
 * l'envoi). Un jalon de projet jamais demandé reste invisible ici — visible
 * seulement dans le Cycle de facturation du projet lui-même — comportement
 * voulu, voir le commentaire d'origine sur requestInvoice : « Fait
 * apparaître la demande dans le centre d'actions d'Administration ».
 *
 * Réutilise entièrement invoiceStatus (billing.ts) pour le statut calculé
 * — aucune nouvelle règle ici, seulement l'agrégation cross-dossier. Les
 * actions elles-mêmes (demander/enregistrer/paiement) restent les
 * fonctions déjà vérifiées de projects/service.ts — jamais réimplémentées.
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
  paidAmount: number;
  paidAt: string | null;
  isExtra: boolean;
  requestedAt: string | null;
  processedAt: string | null;
  sourceType: "project" | "rolling" | "serviceCall";
  sourceLabel: string;
  clientLabel: string;
}

export async function listInvoiceEntries(): Promise<InvoiceEntryDto[]> {
  const rows = await prisma.invoicePlanEntry.findMany({
    where: { requestedAt: { not: null } },
    include: {
      project: { include: { contact: { select: { name: true, company: true } } } },
      rolling: { include: { contact: { select: { name: true, company: true } } } },
      serviceCall: { include: { contact: { select: { name: true, company: true } } } },
    },
    orderBy: { requestedAt: "desc" },
  });

  return rows.map((row) => {
    let sourceType: InvoiceEntryDto["sourceType"] = "project";
    let sourceLabel = "—";
    let clientLabel = "—";
    if (row.project) {
      sourceType = "project";
      sourceLabel = `${row.project.projectNumber} — ${row.project.name}`;
      clientLabel = row.project.contact.company ?? row.project.contact.name;
    } else if (row.serviceCall) {
      sourceType = "serviceCall";
      sourceLabel = `${row.serviceCall.displayId} — ${serviceCallDisplayTitle(row.serviceCall)}`;
      clientLabel = row.serviceCall.contact.company ?? row.serviceCall.contact.name;
    } else if (row.rolling) {
      sourceType = "rolling";
      sourceLabel = "Roulement";
      clientLabel = row.rolling.contact.company ?? row.rolling.contact.name;
    }

    const statusInput: InvoiceLike = {
      amount: Number(row.amount),
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
      paidAmount: Number(row.paidAmount),
      paidAt: row.paidAt?.toISOString() ?? null,
      isExtra: row.isExtra,
      requestedAt: row.requestedAt?.toISOString() ?? null,
      processedAt: row.processedAt?.toISOString() ?? null,
      sourceType,
      sourceLabel,
      clientLabel,
    };
  });
}
