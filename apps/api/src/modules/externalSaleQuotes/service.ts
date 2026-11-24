/**
 * GSC Pilot — Soumission de Vente externe (nouveau module, 23 novembre
 * 2026)
 *
 * Affichée « Soumission » à l'écran (même mot que Projet/Roulement,
 * décision confirmée) mais mécanisme TECHNIQUEMENT DISTINCT du modèle
 * Soumission existant (soumissions/service.ts, Budget→Projet/Roulement) —
 * voir le commentaire du modèle ExternalSaleQuote dans schema.prisma pour
 * le détail complet du piège de nommage volontaire. Ne jamais fusionner
 * les deux mécanismes.
 *
 * Contrairement à createExternalSale (qui crée tout d'un coup, lignes
 * PurchaseRequest incluses), une soumission existe et reste pleinement
 * éditable AVANT qu'aucune vraie vente/PurchaseRequest n'existe — le
 * contact reste du texte brut (jamais ensureContactRow ici) et
 * ClientRequest n'est jamais touché avant la conversion
 * (convertExternalSaleQuoteToSale), pour qu'une soumission refusée ne
 * laisse aucune trace (ni Contact fusionné, ni ClientRequest basculé).
 *
 * Lignes au format description/qty/unitCost (PAS label/qty/unitPrice comme
 * le Soumission original) — une Soumission de VE doit refaire le calcul
 * coût→marge→prix qu'externalSaleTotals fait déjà pour une vente directe,
 * jamais recevoir un prix pré-calculé en amont comme le fait Budget.
 *
 * Les deux flux de création (vente directe ET soumission d'abord) restent
 * disponibles côte à côte — jamais une obligation (décision confirmée).
 */
import { externalSaleLineAmount, externalSaleTotals, computeInvoiceTax } from "@gsc-pilot/business-rules";
import { prisma } from "../../db.js";
import { HttpError } from "../../middleware/errorHandler.js";
import { resolveSequentialNumber } from "../settings/sequentialNumbers.js";
import { createExternalSale } from "../externalSales/service.js";
import type { ExternalSale, ExternalSaleQuote } from "../../generated/prisma/client.js";

function resolveNextExternalSaleQuoteNumber(
  settings: { nextExternalSaleQuoteNumber: number; externalSaleQuoteNumberYear: number },
  year?: number,
) {
  return resolveSequentialNumber({ next: settings.nextExternalSaleQuoteNumber, year: settings.externalSaleQuoteNumberYear }, year);
}

function formatExternalSaleQuoteDisplayId(year: number, number: number): string {
  return `DV-${year}-${String(number).padStart(4, "0")}`;
}

export interface NextExternalSaleQuoteNumberDto {
  nextDisplayId: string;
  defaultMarginPct: number;
}

/** Aperçu du prochain numéro + marge par défaut (Settings.externalSaleDefaultMarginPct — même champ que la vente directe, même concept) — jamais incrémenté. */
export async function getNextExternalSaleQuoteDisplayId(): Promise<NextExternalSaleQuoteNumberDto> {
  const settings = await prisma.settings.findFirst();
  if (!settings) throw new HttpError(500, "Paramètres non initialisés — lancer le seed.");
  const { year, number } = resolveNextExternalSaleQuoteNumber(settings);
  return { nextDisplayId: formatExternalSaleQuoteDisplayId(year, number), defaultMarginPct: Number(settings.externalSaleDefaultMarginPct) };
}

export interface ExternalSaleQuoteLineInput {
  description: string;
  qty: number;
  unitCost: number;
}

export interface NewExternalSaleQuoteContactInput {
  contactName: string;
  company?: string;
  contactRole?: string;
  phone?: string;
  email?: string;
}

export interface CreateExternalSaleQuoteInput {
  clientRequestId?: string;
  newContact: NewExternalSaleQuoteContactInput;
  lines: ExternalSaleQuoteLineInput[];
  transportFee: number;
  adminFee: number;
  marginPct: number;
  introText?: string;
  termsText?: string;
}

function assertValidQuoteLines(lines: ExternalSaleQuoteLineInput[]): void {
  if (!lines || lines.length === 0) throw new HttpError(400, "Au moins une ligne de pièce est requise.");
  for (const line of lines) {
    if (!line.description?.trim()) throw new HttpError(400, "Chaque ligne doit avoir une description.");
  }
}

export async function createExternalSaleQuote(createdById: string, input: CreateExternalSaleQuoteInput): Promise<ExternalSaleQuote> {
  if (!input.newContact?.contactName?.trim()) throw new HttpError(400, "Le nom du contact est requis.");
  assertValidQuoteLines(input.lines);

  const lineAmounts = input.lines.map((line) => externalSaleLineAmount(line.qty, line.unitCost));

  return prisma.$transaction(async (tx) => {
    const settings = await tx.settings.findFirst();
    if (!settings) throw new HttpError(500, "Paramètres non initialisés — lancer le seed.");
    const { year, number } = resolveNextExternalSaleQuoteNumber(settings);
    const displayId = formatExternalSaleQuoteDisplayId(year, number);

    const quote = await tx.externalSaleQuote.create({
      data: {
        displayId,
        clientRequestId: input.clientRequestId ?? null,
        contactName: input.newContact.contactName.trim(),
        company: input.newContact.company?.trim() || null,
        contactRole: input.newContact.contactRole?.trim() || null,
        phone: input.newContact.phone?.trim() || null,
        email: input.newContact.email?.trim() || null,
        transportFee: input.transportFee,
        adminFee: input.adminFee,
        marginPct: input.marginPct,
        introText: input.introText?.trim() || null,
        termsText: input.termsText?.trim() || null,
        createdById,
        lines: {
          create: input.lines.map((line, index) => ({
            description: line.description.trim(),
            qty: line.qty,
            unitCost: line.unitCost,
            amount: lineAmounts[index]!,
            sortOrder: index,
          })),
        },
      },
    });
    await tx.settings.update({ where: { id: settings.id }, data: { nextExternalSaleQuoteNumber: number + 1, externalSaleQuoteNumberYear: year } });
    return quote;
  });
}

async function loadExternalSaleQuoteOrThrow(id: string) {
  const quote = await prisma.externalSaleQuote.findUnique({ where: { id }, include: { lines: { orderBy: { sortOrder: "asc" } } } });
  if (!quote) throw new HttpError(404, "Soumission introuvable.");
  return quote;
}

export interface UpdateExternalSaleQuoteInput {
  newContact?: NewExternalSaleQuoteContactInput;
  lines?: ExternalSaleQuoteLineInput[];
  transportFee?: number;
  adminFee?: number;
  marginPct?: number;
  introText?: string;
  termsText?: string;
}

/** Uniquement tant que status==="draft" — même règle que updateSoumission. Une révision après envoi devient une nouvelle soumission, jamais une modification silencieuse d'un document déjà envoyé. */
export async function updateExternalSaleQuote(id: string, input: UpdateExternalSaleQuoteInput): Promise<void> {
  const quote = await loadExternalSaleQuoteOrThrow(id);
  if (quote.status !== "draft") throw new HttpError(400, "Seule une soumission à l'état brouillon peut être modifiée.");
  if (input.lines) assertValidQuoteLines(input.lines);

  await prisma.$transaction(async (tx) => {
    if (input.lines) {
      await tx.externalSaleQuoteLine.deleteMany({ where: { quoteId: id } });
      await tx.externalSaleQuoteLine.createMany({
        data: input.lines.map((line, index) => ({
          quoteId: id,
          description: line.description.trim(),
          qty: line.qty,
          unitCost: line.unitCost,
          amount: externalSaleLineAmount(line.qty, line.unitCost),
          sortOrder: index,
        })),
      });
    }
    await tx.externalSaleQuote.update({
      where: { id },
      data: {
        ...(input.newContact
          ? {
              contactName: input.newContact.contactName.trim(),
              company: input.newContact.company?.trim() || null,
              contactRole: input.newContact.contactRole?.trim() || null,
              phone: input.newContact.phone?.trim() || null,
              email: input.newContact.email?.trim() || null,
            }
          : {}),
        ...(input.transportFee !== undefined ? { transportFee: input.transportFee } : {}),
        ...(input.adminFee !== undefined ? { adminFee: input.adminFee } : {}),
        ...(input.marginPct !== undefined ? { marginPct: input.marginPct } : {}),
        ...(input.introText !== undefined ? { introText: input.introText.trim() || null } : {}),
        ...(input.termsText !== undefined ? { termsText: input.termsText.trim() || null } : {}),
      },
    });
  });
}

/** Gèle partsBaseCost/salePrice (externalSaleTotals) + tpsAmount/tvqAmount/totalWithTax (computeInvoiceTax, Settings.tpsRatePct/tvqRatePct) — taxes incluses (décision confirmée, le client voit le montant total à payer). */
export async function sendExternalSaleQuote(id: string): Promise<void> {
  const quote = await loadExternalSaleQuoteOrThrow(id);
  if (quote.status !== "draft") throw new HttpError(400, "Cette soumission a déjà été envoyée.");
  if (quote.lines.length === 0) throw new HttpError(400, "Au moins une ligne est requise avant l'envoi.");

  const settings = await prisma.settings.findFirst();
  if (!settings) throw new HttpError(500, "Paramètres non initialisés — lancer le seed.");

  const { partsBaseCost, salePrice } = externalSaleTotals(
    quote.lines.map((line) => ({ qty: Number(line.qty), unitCost: Number(line.unitCost) })),
    Number(quote.transportFee),
    Number(quote.adminFee),
    Number(quote.marginPct),
  );
  const tax = computeInvoiceTax(salePrice, Number(settings.tpsRatePct), Number(settings.tvqRatePct));

  await prisma.externalSaleQuote.update({
    where: { id },
    data: {
      status: "sent",
      sentAt: new Date(),
      partsBaseCost,
      salePrice,
      tpsAmount: tax.tpsAmount,
      tvqAmount: tax.tvqAmount,
      totalWithTax: tax.totalWithTax,
    },
  });
}

export async function decideExternalSaleQuote(id: string, outcome: "accepted" | "declined"): Promise<void> {
  const quote = await loadExternalSaleQuoteOrThrow(id);
  if (quote.status !== "sent") throw new HttpError(400, "Cette soumission doit d'abord être envoyée.");
  await prisma.externalSaleQuote.update({ where: { id }, data: { status: outcome, decidedAt: new Date() } });
}

/** Soft delete — bloqué si déjà convertie (même garde que deleteSoumission, bloquée si une Confirmation de commande existe). */
export async function deleteExternalSaleQuote(id: string): Promise<void> {
  await loadExternalSaleQuoteOrThrow(id);
  const existingSale = await prisma.externalSale.findUnique({ where: { quoteId: id } });
  if (existingSale) throw new HttpError(409, "Cette soumission a déjà été convertie en vente externe.");
  await prisma.externalSaleQuote.update({ where: { id }, data: { deletedAt: new Date() } });
}

/**
 * Conversion — réutilise createExternalSale directement (son transaction
 * complète : numéro VE-, PurchaseRequest par ligne, bascule ClientRequest
 * si clientRequestId présent) plutôt que de dupliquer sa logique. C'est
 * SEULEMENT ICI que ensureContactRow résout/fusionne le Contact et que
 * ClientRequest bascule — jamais à la création de la soumission, pour
 * qu'une soumission refusée laisse tout intact.
 */
export async function convertExternalSaleQuoteToSale(quoteId: string, createdById: string): Promise<ExternalSale> {
  const quote = await loadExternalSaleQuoteOrThrow(quoteId);
  if (quote.status !== "accepted") throw new HttpError(400, "Cette soumission doit d'abord être acceptée.");
  const existingSale = await prisma.externalSale.findUnique({ where: { quoteId } });
  if (existingSale) throw new HttpError(409, "Cette soumission a déjà été convertie en vente externe.");

  return createExternalSale(createdById, {
    clientRequestId: quote.clientRequestId ?? undefined,
    quoteId: quote.id,
    newContact: {
      contactName: quote.contactName,
      company: quote.company ?? undefined,
      contactRole: quote.contactRole ?? undefined,
      phone: quote.phone ?? undefined,
      email: quote.email ?? undefined,
    },
    lines: quote.lines.map((line) => ({ description: line.description, qty: Number(line.qty), unitCost: Number(line.unitCost) })),
    transportFee: Number(quote.transportFee),
    adminFee: Number(quote.adminFee),
    marginPct: Number(quote.marginPct),
  });
}

export interface ExternalSaleQuoteListItemDto {
  id: string;
  displayId: string;
  contactName: string;
  company: string | null;
  status: string;
  salePrice: number | null;
  createdAt: string;
  convertedSaleId: string | null;
}

/**
 * Une soumission déjà convertie en vente quitte cette liste « en cours » —
 * demande explicite du 24 novembre 2026 (« il faut qu'elle se supprime de
 * cette section ») : elle reste pleinement consultable/imprimable par son
 * propre id (getExternalSaleQuoteDetail, jamais touché ici), mais
 * uniquement via le document rattaché à sa vente
 * (ExternalSaleDocuments.tsx), jamais plus listée ici en double.
 */
export async function listExternalSaleQuotes(): Promise<ExternalSaleQuoteListItemDto[]> {
  const rows = await prisma.externalSaleQuote.findMany({
    where: { deletedAt: null },
    include: { sale: { select: { id: true } } },
    orderBy: { createdAt: "desc" },
  });
  return rows
    .filter((row) => !row.sale)
    .map((row) => ({
      id: row.id,
      displayId: row.displayId,
      contactName: row.contactName,
      company: row.company,
      status: row.status,
      salePrice: row.salePrice === null ? null : Number(row.salePrice),
      createdAt: row.createdAt.toISOString(),
      convertedSaleId: row.sale?.id ?? null,
    }));
}

export interface ExternalSaleQuoteLineDto {
  id: string;
  description: string;
  qty: number;
  unitCost: number;
  amount: number;
}

export interface ExternalSaleQuoteDetailDto {
  id: string;
  displayId: string;
  clientRequestId: string | null;
  contactName: string;
  company: string | null;
  contactRole: string | null;
  phone: string | null;
  email: string | null;
  status: string;
  transportFee: number;
  adminFee: number;
  marginPct: number;
  partsBaseCost: number | null;
  salePrice: number | null;
  tpsAmount: number | null;
  tvqAmount: number | null;
  totalWithTax: number | null;
  introText: string | null;
  termsText: string | null;
  sentAt: string | null;
  decidedAt: string | null;
  createdAt: string;
  convertedSaleId: string | null;
  convertedSaleDisplayId: string | null;
  lines: ExternalSaleQuoteLineDto[];
}

export async function getExternalSaleQuoteDetail(id: string): Promise<ExternalSaleQuoteDetailDto> {
  const quote = await prisma.externalSaleQuote.findUnique({
    where: { id },
    include: { lines: { orderBy: { sortOrder: "asc" } }, sale: { select: { id: true, displayId: true } } },
  });
  if (!quote) throw new HttpError(404, "Soumission introuvable.");
  return {
    id: quote.id,
    displayId: quote.displayId,
    clientRequestId: quote.clientRequestId,
    contactName: quote.contactName,
    company: quote.company,
    contactRole: quote.contactRole,
    phone: quote.phone,
    email: quote.email,
    status: quote.status,
    transportFee: Number(quote.transportFee),
    adminFee: Number(quote.adminFee),
    marginPct: Number(quote.marginPct),
    partsBaseCost: quote.partsBaseCost === null ? null : Number(quote.partsBaseCost),
    salePrice: quote.salePrice === null ? null : Number(quote.salePrice),
    tpsAmount: quote.tpsAmount === null ? null : Number(quote.tpsAmount),
    tvqAmount: quote.tvqAmount === null ? null : Number(quote.tvqAmount),
    totalWithTax: quote.totalWithTax === null ? null : Number(quote.totalWithTax),
    introText: quote.introText,
    termsText: quote.termsText,
    sentAt: quote.sentAt?.toISOString() ?? null,
    decidedAt: quote.decidedAt?.toISOString() ?? null,
    createdAt: quote.createdAt.toISOString(),
    convertedSaleId: quote.sale?.id ?? null,
    convertedSaleDisplayId: quote.sale?.displayId ?? null,
    lines: quote.lines.map((line) => ({
      id: line.id,
      description: line.description,
      qty: Number(line.qty),
      unitCost: Number(line.unitCost),
      amount: Number(line.amount),
    })),
  };
}
