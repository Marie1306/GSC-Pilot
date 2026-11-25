/**
 * GSC Pilot — Confirmation de commande de Vente externe (25 novembre 2026,
 * demande explicite de Marie — « comme les autres modules »)
 *
 * Même esprit que confirmationsDeCommande/service.ts (Budget/Soumission)
 * mais mécanisme PARALLÈLE, jamais fusionné — voir le commentaire du
 * modèle ExternalSaleConfirmation dans schema.prisma. Artefact feuille,
 * lecture seule, figé une fois pour toutes : aucun statut, aucun cycle
 * décision, rien n'est recalculé après la conversion.
 *
 * Indépendante de convertExternalSaleQuoteToSale (externalSaleQuotes/
 * service.ts) — décision confirmée avec Marie : les deux conversions
 * restent disponibles dans n'importe quel ordre, sans dépendance entre
 * elles, exactement comme ConfirmationDeCommande ne gate jamais
 * convertBudgetToProject/convertBudgetToRolling. Jamais branchée dans le
 * calcul de Facture (qui utilise déjà externalSaleInvoiceLines sur les
 * PurchaseRequest réelles de la vente, corrigé le 24 novembre) — pas de
 * getConfirmationBreakdownsByBudgetIds-équivalent ici, volontairement.
 */
import { externalSaleInvoiceLines } from "@gsc-pilot/business-rules";
import { prisma } from "../../db.js";
import { HttpError } from "../../middleware/errorHandler.js";
import { resolveSequentialNumber } from "../settings/sequentialNumbers.js";
import type { Prisma } from "../../generated/prisma/client.js";

function formatExternalSaleConfirmationDisplayId(year: number, number: number): string {
  return `CE-${year}-${String(number).padStart(4, "0")}`;
}

const CONFIRMATION_DETAIL_INCLUDE = {
  lines: { orderBy: { sortOrder: "asc" as const } },
  quote: { select: { displayId: true } },
} satisfies Prisma.ExternalSaleConfirmationInclude;

type ExternalSaleConfirmationWithDetail = Prisma.ExternalSaleConfirmationGetPayload<{ include: typeof CONFIRMATION_DETAIL_INCLUDE }>;

export interface ExternalSaleConfirmationLineDto {
  id: string;
  description: string;
  qty: number;
  unitPrice: number;
  amount: number;
  sortOrder: number;
}

export interface ExternalSaleConfirmationDetailDto {
  id: string;
  displayId: string;
  quoteId: string;
  quoteDisplayId: string;
  clientPoNumber: string | null;
  introText: string | null;
  termsText: string | null;
  contactName: string;
  company: string | null;
  contactRole: string | null;
  phone: string | null;
  email: string | null;
  amountBeforeTax: number;
  tpsAmount: number;
  tvqAmount: number;
  totalWithTax: number;
  createdAt: string;
  lines: ExternalSaleConfirmationLineDto[];
}

function toConfirmationDetailDto(row: ExternalSaleConfirmationWithDetail): ExternalSaleConfirmationDetailDto {
  return {
    id: row.id,
    displayId: row.displayId,
    quoteId: row.quoteId,
    quoteDisplayId: row.quote.displayId,
    clientPoNumber: row.clientPoNumber,
    introText: row.introText,
    termsText: row.termsText,
    contactName: row.contactName,
    company: row.company,
    contactRole: row.contactRole,
    phone: row.phone,
    email: row.email,
    amountBeforeTax: Number(row.amountBeforeTax),
    tpsAmount: Number(row.tpsAmount),
    tvqAmount: Number(row.tvqAmount),
    totalWithTax: Number(row.totalWithTax),
    createdAt: row.createdAt.toISOString(),
    lines: row.lines.map((line) => ({
      id: line.id,
      description: line.description,
      qty: Number(line.qty),
      unitPrice: Number(line.unitPrice),
      amount: Number(line.amount),
      sortOrder: line.sortOrder,
    })),
  };
}

export interface ConvertExternalSaleQuoteToConfirmationInput {
  clientPoNumber?: string;
}

/**
 * Conversion depuis une ExternalSaleQuote ACCEPTÉE — copie GELÉE des
 * montants déjà figés à l'envoi (sendExternalSaleQuote) et des lignes,
 * repassées par externalSaleInvoiceLines pour geler le PRIX (jamais le
 * coût unitCost brut de ExternalSaleQuoteLine) — même mécanisme que la
 * correction du 24 novembre sur l'affichage de la Soumission elle-même.
 * Contact copié depuis la Soumission (contactName/company/...), JAMAIS
 * depuis ExternalSale.contact — la vente peut ne pas encore exister, ou
 * avoir résolu son contact séparément (les deux conversions sont
 * indépendantes, dans n'importe quel ordre).
 */
export async function convertExternalSaleQuoteToConfirmation(
  quoteId: string,
  createdById: string,
  input: ConvertExternalSaleQuoteToConfirmationInput,
): Promise<ExternalSaleConfirmationDetailDto> {
  const quote = await prisma.externalSaleQuote.findUnique({
    where: { id: quoteId },
    include: { lines: { orderBy: { sortOrder: "asc" } } },
  });
  if (!quote) throw new HttpError(404, "Soumission introuvable.");
  if (quote.status !== "accepted") throw new HttpError(400, "Cette soumission doit d'abord être acceptée.");
  if (quote.salePrice === null || quote.tpsAmount === null || quote.tvqAmount === null || quote.totalWithTax === null) {
    throw new HttpError(500, "Soumission acceptée sans montants gelés — état incohérent.");
  }

  const existing = await prisma.externalSaleConfirmation.findUnique({ where: { quoteId } });
  if (existing) throw new HttpError(409, "Cette soumission a déjà été convertie en confirmation de commande.");

  const invoiceLines = externalSaleInvoiceLines(
    quote.lines.map((line) => ({ description: line.description, qty: Number(line.qty), unitCost: Number(line.unitCost) })),
    Number(quote.transportFee),
    Number(quote.adminFee),
    Number(quote.marginPct),
  );

  const confirmation = await prisma.$transaction(async (tx) => {
    const settings = await tx.settings.findFirst();
    if (!settings) throw new HttpError(500, "Paramètres non initialisés — lancer le seed.");
    const { year, number } = resolveSequentialNumber({
      next: settings.nextExternalSaleConfirmationNumber,
      year: settings.externalSaleConfirmationNumberYear,
    });
    const displayId = formatExternalSaleConfirmationDisplayId(year, number);

    const created = await tx.externalSaleConfirmation.create({
      data: {
        displayId,
        quoteId,
        contactName: quote.contactName,
        company: quote.company,
        contactRole: quote.contactRole,
        phone: quote.phone,
        email: quote.email,
        clientPoNumber: input.clientPoNumber?.trim() || null,
        introText: quote.introText,
        termsText: quote.termsText,
        amountBeforeTax: quote.salePrice!,
        tpsAmount: quote.tpsAmount!,
        tvqAmount: quote.tvqAmount!,
        totalWithTax: quote.totalWithTax!,
        createdById,
        lines: {
          create: invoiceLines.map((line, index) => ({
            description: line.description,
            qty: line.quantity,
            unitPrice: line.unitPrice,
            amount: line.amount,
            sortOrder: index,
          })),
        },
      },
      include: CONFIRMATION_DETAIL_INCLUDE,
    });
    await tx.settings.update({
      where: { id: settings.id },
      data: { nextExternalSaleConfirmationNumber: number + 1, externalSaleConfirmationNumberYear: year },
    });
    return created;
  });

  return toConfirmationDetailDto(confirmation);
}

export async function getExternalSaleConfirmationDetail(id: string): Promise<ExternalSaleConfirmationDetailDto> {
  const row = await prisma.externalSaleConfirmation.findUnique({ where: { id }, include: CONFIRMATION_DETAIL_INCLUDE });
  if (!row) throw new HttpError(404, "Confirmation de commande introuvable.");
  return toConfirmationDetailDto(row);
}

/** Pour ExternalSaleQuoteDetail.tsx : null tant qu'aucune conversion n'a eu lieu, jamais une erreur 404. */
export async function getConfirmationForExternalSaleQuote(quoteId: string): Promise<ExternalSaleConfirmationDetailDto | null> {
  const row = await prisma.externalSaleConfirmation.findUnique({ where: { quoteId }, include: CONFIRMATION_DETAIL_INCLUDE });
  return row ? toConfirmationDetailDto(row) : null;
}

/** Corbeille — même mécanisme que ConfirmationDeCommande/Soumission.deletedAt. */
export async function deleteExternalSaleConfirmation(id: string): Promise<void> {
  const row = await prisma.externalSaleConfirmation.findUnique({ where: { id } });
  if (!row) throw new HttpError(404, "Confirmation de commande introuvable.");
  await prisma.externalSaleConfirmation.update({ where: { id }, data: { deletedAt: new Date() } });
}
