/**
 * GSC Pilot — Confirmation de commande (Partie 2, 15 novembre 2026)
 *
 * Vraie conversion depuis une Soumission ACCEPTÉE (même esprit que
 * convertBudgetToProject, projects/service.ts) : son propre numéro
 * (CC-AAAA-NNNN, remise à zéro annuelle, même mécanisme que Soumission),
 * copie GELÉE des lignes et des montants de taxe déjà figés sur la
 * Soumission à son envoi — jamais recalculés ici, c'est une copie pure,
 * pas une nouvelle composition. Une seule confirmation par soumission
 * (contrainte DB @unique sur soumissionId) — deleteSoumission (voir
 * soumissions/service.ts) bloque déjà la suppression d'une soumission une
 * fois convertie.
 *
 * L'affichage client (« Présenté à ») relit ClientRequest via
 * soumission.budget.clientRequestId — même patron que Soumission
 * elle-même (voir son commentaire d'en-tête), dupliqué ici volontairement
 * plutôt que partagé entre modules (même prudence déjà démontrée ailleurs
 * sur ce projet, ex. applyPurchaseRequestToExternalSale).
 */
import { prisma } from "../../db.js";
import { HttpError } from "../../middleware/errorHandler.js";
import { resolveSequentialNumber } from "../settings/sequentialNumbers.js";
import type { Prisma } from "../../generated/prisma/client.js";

function formatConfirmationDisplayId(year: number, number: number): string {
  return `CC-${year}-${String(number).padStart(4, "0")}`;
}

const CONFIRMATION_DETAIL_INCLUDE = {
  lines: { orderBy: { sortOrder: "asc" as const } },
  soumission: { select: { displayId: true, budget: { select: { clientRequestId: true } } } },
} satisfies Prisma.ConfirmationDeCommandeInclude;

type ConfirmationWithDetail = Prisma.ConfirmationDeCommandeGetPayload<{ include: typeof CONFIRMATION_DETAIL_INCLUDE }>;

interface ClientDisplayInfo {
  contactName: string | null;
  company: string | null;
  email: string | null;
  phone: string | null;
  address: string | null;
}

const EMPTY_CLIENT_DISPLAY: ClientDisplayInfo = { contactName: null, company: null, email: null, phone: null, address: null };

/** Même patron que Soumission/getBudgetDetail — Contact n'a pas de champ adresse, ClientRequest si. */
async function resolveClientDisplay(clientRequestId: string | null): Promise<ClientDisplayInfo> {
  if (!clientRequestId) return EMPTY_CLIENT_DISPLAY;
  const clientRequest = await prisma.clientRequest.findUnique({
    where: { id: clientRequestId },
    select: { contactName: true, company: true, email: true, phone: true, address: true },
  });
  return clientRequest ?? EMPTY_CLIENT_DISPLAY;
}

export interface ConfirmationLineDto {
  id: string;
  label: string;
  qty: number;
  unitPrice: number;
  amount: number;
  sortOrder: number;
}

export interface ConfirmationDetailDto {
  id: string;
  displayId: string;
  soumissionId: string;
  soumissionDisplayId: string;
  clientPoNumber: string | null;
  introText: string | null;
  termsText: string | null;
  contactName: string | null;
  company: string | null;
  email: string | null;
  phone: string | null;
  address: string | null;
  amountBeforeTax: number;
  tpsAmount: number;
  tvqAmount: number;
  totalWithTax: number;
  createdAt: string;
  lines: ConfirmationLineDto[];
}

async function toConfirmationDetailDto(row: ConfirmationWithDetail): Promise<ConfirmationDetailDto> {
  const client = await resolveClientDisplay(row.soumission.budget.clientRequestId);
  return {
    id: row.id,
    displayId: row.displayId,
    soumissionId: row.soumissionId,
    soumissionDisplayId: row.soumission.displayId,
    clientPoNumber: row.clientPoNumber,
    introText: row.introText,
    termsText: row.termsText,
    contactName: client.contactName,
    company: client.company,
    email: client.email,
    phone: client.phone,
    address: client.address,
    amountBeforeTax: Number(row.amountBeforeTax),
    tpsAmount: Number(row.tpsAmount),
    tvqAmount: Number(row.tvqAmount),
    totalWithTax: Number(row.totalWithTax),
    createdAt: row.createdAt.toISOString(),
    lines: row.lines.map((line) => ({
      id: line.id,
      label: line.label,
      qty: Number(line.qty),
      unitPrice: Number(line.unitPrice),
      amount: Number(line.amount),
      sortOrder: line.sortOrder,
    })),
  };
}

export interface ConvertSoumissionInput {
  clientPoNumber?: string;
}

export async function convertSoumissionToConfirmation(soumissionId: string, createdById: string, input: ConvertSoumissionInput): Promise<ConfirmationDetailDto> {
  const soumission = await prisma.soumission.findUnique({
    where: { id: soumissionId },
    include: { lines: { orderBy: { sortOrder: "asc" } } },
  });
  if (!soumission) throw new HttpError(404, "Soumission introuvable.");
  if (soumission.status !== "accepted") throw new HttpError(400, "Cette soumission doit d'abord être acceptée.");
  if (soumission.amountBeforeTax === null || soumission.tpsAmount === null || soumission.tvqAmount === null || soumission.totalWithTax === null) {
    throw new HttpError(500, "Soumission acceptée sans montants gelés — état incohérent.");
  }

  const existing = await prisma.confirmationDeCommande.findUnique({ where: { soumissionId } });
  if (existing) throw new HttpError(409, "Cette soumission a déjà été convertie en confirmation de commande.");

  const confirmation = await prisma.$transaction(async (tx) => {
    const settings = await tx.settings.findFirst();
    if (!settings) throw new HttpError(500, "Paramètres non initialisés — lancer le seed.");
    const { year, number } = resolveSequentialNumber({ next: settings.nextConfirmationNumber, year: settings.confirmationNumberYear });
    const displayId = formatConfirmationDisplayId(year, number);

    const created = await tx.confirmationDeCommande.create({
      data: {
        displayId,
        soumissionId,
        contactId: soumission.contactId,
        clientPoNumber: input.clientPoNumber?.trim() || null,
        introText: soumission.introText,
        termsText: soumission.termsText,
        amountBeforeTax: soumission.amountBeforeTax!,
        tpsAmount: soumission.tpsAmount!,
        tvqAmount: soumission.tvqAmount!,
        totalWithTax: soumission.totalWithTax!,
        createdById,
        lines: {
          create: soumission.lines.map((line) => ({
            label: line.label,
            qty: line.qty,
            unitPrice: line.unitPrice,
            amount: line.amount,
            sortOrder: line.sortOrder,
          })),
        },
      },
      include: CONFIRMATION_DETAIL_INCLUDE,
    });
    await tx.settings.update({ where: { id: settings.id }, data: { nextConfirmationNumber: number + 1, confirmationNumberYear: year } });
    return created;
  });

  return toConfirmationDetailDto(confirmation);
}

export async function getConfirmationDetail(id: string): Promise<ConfirmationDetailDto> {
  const row = await prisma.confirmationDeCommande.findUnique({ where: { id }, include: CONFIRMATION_DETAIL_INCLUDE });
  if (!row) throw new HttpError(404, "Confirmation de commande introuvable.");
  return toConfirmationDetailDto(row);
}

/** Pour SoumissionCard.tsx : null tant qu'aucune conversion n'a eu lieu, jamais une erreur 404. */
export async function getConfirmationForSoumission(soumissionId: string): Promise<ConfirmationDetailDto | null> {
  const row = await prisma.confirmationDeCommande.findUnique({ where: { soumissionId }, include: CONFIRMATION_DETAIL_INCLUDE });
  return row ? toConfirmationDetailDto(row) : null;
}

/** Corbeille — même mécanisme que Soumission/Budget/Project.deletedAt. */
export async function deleteConfirmationDeCommande(id: string): Promise<void> {
  const row = await prisma.confirmationDeCommande.findUnique({ where: { id } });
  if (!row) throw new HttpError(404, "Confirmation de commande introuvable.");
  await prisma.confirmationDeCommande.update({ where: { id }, data: { deletedAt: new Date() } });
}
