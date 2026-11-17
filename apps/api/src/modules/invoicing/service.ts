/**
 * GSC Pilot — Facturation, vue consolidée (20 août 2026)
 *
 * Regroupe dans un seul écran les jalons de facturation déjà DEMANDÉS
 * (projets/roulements, via le geste unifié "Demander la facturation" —
 * confirmInvoiceRequest, projects/service.ts), les appels de service
 * facturés par sélection de Bons de travail (createServiceCallInvoiceForSelection,
 * serviceCalls/service.ts, Chantier D 16 novembre 2026 — remplace
 * sendServiceCallToAdmin) et les ventes externes terminées (requestExternalSaleInvoice,
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
import { serviceCallDisplayTitle, getServiceCallInvoiceBreakdowns, type InvoiceBonDeTravailBreakdownDto } from "../serviceCalls/service.js";
import { getConfirmationBreakdownsByBudgetIds } from "../confirmationsDeCommande/service.js";

export interface InvoiceAmendmentLineDto {
  id: string;
  displayId: string;
  description: string | null;
  amount: number;
}

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
  // Carte client détaillée (16 novembre 2026, export PDF Facture) — à côté
  // de clientLabel ci-dessus (déjà affiché tel quel dans InvoicingPage.tsx,
  // jamais retiré), pour la carte « Présenté à » de InvoiceExportView.tsx
  // (même forme que Soumission/Confirmation). Contact n'a pas de champ
  // adresse (contrairement à ClientRequest, voir soumissions/service.ts) —
  // aucune adresse disponible ici, jamais devinée.
  contactName: string | null;
  company: string | null;
  email: string | null;
  phone: string | null;
  // Avenants dont la pleine valeur a été ajoutée à CETTE entrée (16
  // novembre 2026, selectAmendmentTargetInvoiceEntry) — vide la plupart du
  // temps. baseAmount = amount moins la somme de ces lignes.
  amendmentLines: InvoiceAmendmentLineDto[];
  baseAmount: number;
  // Ventilation par Bon de travail (16 novembre 2026, Chantier D Partie 3) —
  // seulement pour sourceType==="serviceCall", undefined sinon (jamais un
  // tableau vide par défaut, pour distinguer "pas ce type" de "ce BT n'a
  // produit aucune ligne" bien que ce 2e cas ne devrait jamais arriver).
  serviceCallBonsDeTravail?: InvoiceBonDeTravailBreakdownDto[];
  // Ventilation par produit de la Confirmation de commande d'origine (16
  // novembre 2026, rapporté en échec par Marie sur un premier test réel —
  // voir CLAUDE.md ; étendu au Roulement le 17 novembre 2026, même bogue
  // trouvé : un Roulement PEUT avoir un budgétaire donc une Confirmation de
  // commande, jamais vérifié avant ce correctif) — pour sourceType==="project"
  // OU "rolling" ET quand le budget d'origine a une Confirmation de commande
  // (undefined sinon, ex. dossier créé directement sans passer par
  // Soumission/Confirmation — repli sur les lignes manuelles/l'ancien
  // affichage "{label} ({pct}%)" dans ce cas). Nommé sans "project" depuis
  // son élargissement — jamais projectConfirmation, pour ne pas laisser
  // croire que c'est encore réservé au Projet (même piège que owner/boss,
  // voir CLAUDE.md).
  confirmationBreakdown?: InvoiceConfirmationBreakdownDto;
  // Lignes saisies ou dérivées automatiquement puis confirmées au moment de
  // "Demander la facturation" (17 novembre 2026, InvoicePlanEntryLine) —
  // PRIORITAIRES sur confirmationBreakdown/serviceCallBonsDeTravail ci-dessus
  // quand présentes (facture passée par ce nouveau chemin). Vide pour toute
  // facture confirmée avant ce chantier — jamais deviné, repli sur l'ancien
  // affichage dérivé en direct dans ce cas.
  lines?: InvoiceEntryLineDto[];
}

export interface InvoiceEntryLineDto {
  description: string;
  quantity: number;
  unitPrice: number;
  amount: number;
}

export interface InvoiceConfirmationBreakdownLineDto {
  description: string;
  quantity: number;
  unitPrice: number;
  pct: number;
  amount: number;
}

export interface InvoiceConfirmationBreakdownDto {
  displayId: string;
  introText: string | null;
  termsText: string | null;
  lines: InvoiceConfirmationBreakdownLineDto[];
}

/** include Prisma partagé par listInvoiceEntries ci-dessous et listPendingInvoiceEntriesForForecast (treasury/service.ts) — un seul endroit à tenir à jour. */
export const INVOICE_ENTRY_SOURCE_INCLUDE = {
  project: { include: { contact: { select: { name: true, company: true, email: true, phone: true } } } },
  rolling: { include: { contact: { select: { name: true, company: true, email: true, phone: true } } } },
  serviceCall: { include: { contact: { select: { name: true, company: true, email: true, phone: true } } } },
  externalSale: { include: { contact: { select: { name: true, company: true, email: true, phone: true } } } },
} as const;

export interface InvoiceEntrySourceInfo {
  sourceType: InvoiceEntryDto["sourceType"];
  sourceLabel: string;
  clientLabel: string;
  sourceDeleted: boolean;
  // Date de livraison prévue du dossier parent (fulfillmentScheduled pour
  // Project/Rolling/ExternalSale) — ancrage par défaut du prévisionnel
  // (module Trésorerie, 13 novembre 2026) pour un jalon encore pending.
  // Toujours null pour ServiceCall depuis le Chantier D (16 novembre
  // 2026) : la date vit maintenant par Bon de travail (plusieurs possibles
  // par Call), aucune date unique ne représente plus "le call" — de toute
  // façon jamais vraiment exercé pour ce sourceType : une InvoicePlanEntry
  // de ServiceCall est toujours créée déjà confirmée (jamais "pending"),
  // donc jamais retournée par listPendingInvoiceEntriesForForecast
  // (treasury/service.ts), seule consommatrice de ce champ.
  parentScheduledDate: Date | null;
  contact: ContactLike;
}

type ContactLike = { name: string; company: string | null; email: string | null; phone: string | null };

/**
 * Résout le dossier d'origine (projet/roulement/call/vente externe) d'une
 * InvoicePlanEntry — extrait le 13 novembre 2026 (module Trésorerie en a
 * besoin aussi, pour le prévisionnel des jalons pas encore facturés) pour
 * ne jamais dupliquer ce chaînage if/else une deuxième fois.
 */
export function resolveInvoiceEntrySource(row: {
  project: { projectNumber: string; name: string; deletedAt: Date | null; fulfillmentScheduled: Date | null; contact: ContactLike } | null;
  serviceCall: { displayId: string; title: string | null; request: string; deletedAt: Date | null; contact: ContactLike } | null;
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
      contact: row.project.contact,
    };
  }
  if (row.serviceCall) {
    return {
      sourceType: "serviceCall",
      sourceLabel: `${row.serviceCall.displayId} — ${serviceCallDisplayTitle(row.serviceCall)}`,
      clientLabel: row.serviceCall.contact.company ?? row.serviceCall.contact.name,
      sourceDeleted: row.serviceCall.deletedAt !== null,
      parentScheduledDate: null,
      contact: row.serviceCall.contact,
    };
  }
  if (row.rolling) {
    return {
      sourceType: "rolling",
      sourceLabel: row.rolling.rollingNumber,
      clientLabel: row.rolling.contact.company ?? row.rolling.contact.name,
      sourceDeleted: row.rolling.deletedAt !== null,
      parentScheduledDate: row.rolling.fulfillmentScheduled,
      contact: row.rolling.contact,
    };
  }
  if (row.externalSale) {
    return {
      sourceType: "externalSale",
      sourceLabel: row.externalSale.displayId,
      clientLabel: row.externalSale.contact.company ?? row.externalSale.contact.name,
      sourceDeleted: row.externalSale.deletedAt !== null,
      parentScheduledDate: row.externalSale.fulfillmentScheduled,
      contact: row.externalSale.contact,
    };
  }
  return {
    sourceType: "project",
    sourceLabel: "—",
    clientLabel: "—",
    sourceDeleted: false,
    parentScheduledDate: null,
    contact: { name: "—", company: null, email: null, phone: null },
  };
}

function round2(value: number): number {
  return Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100;
}

export async function listInvoiceEntries(): Promise<InvoiceEntryDto[]> {
  const rows = await prisma.invoicePlanEntry.findMany({
    where: { requestedAt: { not: null } },
    include: {
      ...INVOICE_ENTRY_SOURCE_INCLUDE,
      targetedByAmendments: { select: { id: true, displayId: true, description: true, sale: true } },
      lines: true,
    },
    orderBy: { requestedAt: "desc" },
  });

  const serviceCallEntryIds = rows.filter((row) => row.serviceCall).map((row) => row.id);
  const serviceCallBreakdowns = await getServiceCallInvoiceBreakdowns(serviceCallEntryIds);

  // Project ET Rolling peuvent chacun avoir leur propre budgétaire — donc
  // chacun peut avoir une Confirmation de commande (17 novembre 2026,
  // corrige le bogue qui ne vérifiait jamais le cas Roulement).
  const sourceBudgetIds = [
    ...new Set(rows.map((row) => row.project?.budgetId ?? row.rolling?.budgetId).filter((id): id is string => !!id)),
  ];
  const confirmationsByBudgetId = await getConfirmationBreakdownsByBudgetIds(sourceBudgetIds);

  return rows.map((row) => {
    const { sourceType, sourceLabel, clientLabel, sourceDeleted, contact } = resolveInvoiceEntrySource(row);
    const amount = Number(row.amount);
    const pct = Number(row.pct);
    const amendmentLines = row.targetedByAmendments.map((a) => ({ id: a.id, displayId: a.displayId, description: a.description, amount: Number(a.sale) }));
    const sourceBudgetId = row.project?.budgetId ?? row.rolling?.budgetId ?? null;
    const confirmation = sourceBudgetId ? confirmationsByBudgetId[sourceBudgetId] : undefined;
    const confirmationBreakdown: InvoiceConfirmationBreakdownDto | undefined = confirmation && {
      displayId: confirmation.displayId,
      introText: confirmation.introText,
      termsText: confirmation.termsText,
      lines: confirmation.lines.map((line) => ({
        description: line.label,
        quantity: line.qty,
        unitPrice: line.unitPrice,
        pct,
        amount: round2(line.qty * line.unitPrice * (pct / 100)),
      })),
    };
    const lines: InvoiceEntryLineDto[] | undefined =
      row.lines.length > 0
        ? row.lines
            .slice()
            .sort((a, b) => a.sortOrder - b.sortOrder)
            .map((line) => ({ description: line.description, quantity: Number(line.qty), unitPrice: Number(line.unitPrice), amount: Number(line.amount) }))
        : undefined;

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
      pct,
      amount,
      amendmentLines,
      baseAmount: round2(amount - amendmentLines.reduce((sum, line) => sum + line.amount, 0)),
      ...(sourceType === "serviceCall" && { serviceCallBonsDeTravail: serviceCallBreakdowns[row.id] ?? [] }),
      ...((sourceType === "project" || sourceType === "rolling") && confirmationBreakdown && { confirmationBreakdown }),
      ...(lines && { lines }),
      contactName: contact.name,
      company: contact.company,
      email: contact.email,
      phone: contact.phone,
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
