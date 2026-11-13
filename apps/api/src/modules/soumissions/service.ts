/**
 * GSC Pilot — Soumissions (nouveau module, 13 novembre 2026)
 *
 * Document client distinct composé par Marie à partir d'un budgétaire
 * « Prêt », JAMAIS un reflet automatique du contenu interne du budgétaire
 * (confirmé explicitement : « on ne verra jamais toutes les catégories d'un
 * budgétaire » côté client — voir CLAUDE.md). Étape intermédiaire qui se
 * passe AVANT de marquer le budgétaire « Contrat obtenu »/le convertir en
 * projet — ces deux gestes existants (markBudgetOutcome/
 * convertBudgetToProject, budgets+projects/service.ts) restent inchangés,
 * toujours déclenchés manuellement par Marie après coup.
 *
 * Numérotation SO-AAAA-NNNN à remise à zéro annuelle dès le départ (même
 * mécanisme que Vente externe/SEAO, settings/sequentialNumbers.ts).
 *
 * TPS/TVQ gelées à l'envoi (sendSoumission) via computeInvoiceTax
 * (business-rules/billing.ts, déjà utilisée par la Facturation) — jamais
 * recalculées après coup.
 */
import { computeInvoiceTax } from "@gsc-pilot/business-rules";
import { prisma } from "../../db.js";
import { HttpError } from "../../middleware/errorHandler.js";
import { resolveSequentialNumber } from "../settings/sequentialNumbers.js";
import type { Prisma } from "../../generated/prisma/client.js";

/** Remise à zéro annuelle (13 novembre 2026) — voir settings/sequentialNumbers.ts. */
function resolveNextSoumissionNumber(settings: { nextSoumissionNumber: number; soumissionNumberYear: number }, year?: number) {
  return resolveSequentialNumber({ next: settings.nextSoumissionNumber, year: settings.soumissionNumberYear }, year);
}

function formatSoumissionDisplayId(year: number, number: number): string {
  return `SO-${year}-${String(number).padStart(4, "0")}`;
}

const SOUMISSION_DETAIL_INCLUDE = {
  lines: { orderBy: { sortOrder: "asc" as const } },
  budget: { select: { displayId: true } },
  contact: { select: { name: true, company: true } },
} satisfies Prisma.SoumissionInclude;

type SoumissionWithDetail = Prisma.SoumissionGetPayload<{ include: typeof SOUMISSION_DETAIL_INCLUDE }>;

export interface SoumissionLineDto {
  id: string;
  label: string;
  amount: number;
  sortOrder: number;
}

export interface SoumissionDetailDto {
  id: string;
  displayId: string;
  budgetId: string;
  budgetDisplayId: string;
  contactName: string | null;
  company: string | null;
  status: string;
  introText: string | null;
  termsText: string | null;
  amountBeforeTax: number | null;
  tpsAmount: number | null;
  tvqAmount: number | null;
  totalWithTax: number | null;
  sentAt: string | null;
  decidedAt: string | null;
  createdAt: string;
  lines: SoumissionLineDto[];
}

function toSoumissionDetailDto(row: SoumissionWithDetail): SoumissionDetailDto {
  return {
    id: row.id,
    displayId: row.displayId,
    budgetId: row.budgetId,
    budgetDisplayId: row.budget.displayId,
    contactName: row.contact?.name ?? null,
    company: row.contact?.company ?? null,
    status: row.status,
    introText: row.introText,
    termsText: row.termsText,
    amountBeforeTax: row.amountBeforeTax !== null ? Number(row.amountBeforeTax) : null,
    tpsAmount: row.tpsAmount !== null ? Number(row.tpsAmount) : null,
    tvqAmount: row.tvqAmount !== null ? Number(row.tvqAmount) : null,
    totalWithTax: row.totalWithTax !== null ? Number(row.totalWithTax) : null,
    sentAt: row.sentAt?.toISOString() ?? null,
    decidedAt: row.decidedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    lines: row.lines.map((line) => ({ id: line.id, label: line.label, amount: Number(line.amount), sortOrder: line.sortOrder })),
  };
}

export interface SoumissionLineInput {
  label: string;
  amount: number;
}

function assertValidLines(lines: SoumissionLineInput[]): void {
  if (!lines || lines.length === 0) throw new HttpError(400, "Au moins une ligne est requise.");
  for (const line of lines) {
    if (!line.label?.trim()) throw new HttpError(400, "Chaque ligne doit avoir un libellé.");
    if (!(line.amount > 0)) throw new HttpError(400, "Chaque ligne doit avoir un montant positif.");
  }
}

async function loadBudgetForSoumissionOrThrow(budgetId: string) {
  const budget = await prisma.budget.findUnique({
    where: { id: budgetId },
    select: { id: true, status: true, deletedAt: true, clientRequestId: true },
  });
  if (!budget) throw new HttpError(404, "Budgétaire introuvable.");
  if (budget.deletedAt) throw new HttpError(400, "Ce budgétaire est dans la corbeille.");
  if (budget.status === "draft") throw new HttpError(400, "Le budgétaire doit être prêt avant de préparer une soumission.");
  if (budget.status === "declined") throw new HttpError(400, "Ce budgétaire a été refusé.");
  return budget;
}

export interface CreateSoumissionInput {
  introText?: string;
  termsText?: string;
  lines: SoumissionLineInput[];
}

/**
 * Création — le contactId est dénormalisé depuis budget.clientRequestId →
 * clientRequest.contactId (même chemin exact que convertBudgetToProject,
 * projects/service.ts), résolu AVANT la transaction (lecture seule).
 */
export async function createSoumission(budgetId: string, createdById: string, input: CreateSoumissionInput): Promise<SoumissionDetailDto> {
  const budget = await loadBudgetForSoumissionOrThrow(budgetId);
  assertValidLines(input.lines);

  const contactId = budget.clientRequestId
    ? ((await prisma.clientRequest.findUnique({ where: { id: budget.clientRequestId }, select: { contactId: true } }))?.contactId ?? null)
    : null;

  return prisma.$transaction(async (tx) => {
    const settings = await tx.settings.findFirst();
    if (!settings) throw new HttpError(500, "Paramètres non initialisés — lancer le seed.");
    const { year, number } = resolveNextSoumissionNumber(settings);
    const displayId = formatSoumissionDisplayId(year, number);

    const soumission = await tx.soumission.create({
      data: {
        displayId,
        budgetId,
        contactId,
        introText: input.introText?.trim() || null,
        termsText: input.termsText?.trim() || null,
        createdById,
        lines: { create: input.lines.map((line, index) => ({ label: line.label.trim(), amount: line.amount, sortOrder: index })) },
      },
      include: SOUMISSION_DETAIL_INCLUDE,
    });
    await tx.settings.update({ where: { id: settings.id }, data: { nextSoumissionNumber: number + 1, soumissionNumberYear: year } });

    return toSoumissionDetailDto(soumission);
  });
}

async function loadSoumissionOrThrow(id: string): Promise<SoumissionWithDetail> {
  const soumission = await prisma.soumission.findUnique({ where: { id }, include: SOUMISSION_DETAIL_INCLUDE });
  if (!soumission) throw new HttpError(404, "Soumission introuvable.");
  return soumission;
}

export interface UpdateSoumissionInput {
  introText?: string;
  termsText?: string;
  lines?: SoumissionLineInput[];
}

/** Bloqué hors "draft" — une révision après envoi est une NOUVELLE soumission (createSoumission), jamais une modification silencieuse d'un document déjà remis au client. */
export async function updateSoumission(id: string, input: UpdateSoumissionInput): Promise<SoumissionDetailDto> {
  const soumission = await loadSoumissionOrThrow(id);
  if (soumission.status !== "draft") throw new HttpError(400, "Seule une soumission à l'état brouillon peut être modifiée.");
  if (input.lines) assertValidLines(input.lines);

  return prisma.$transaction(async (tx) => {
    if (input.lines) {
      await tx.soumissionLine.deleteMany({ where: { soumissionId: id } });
      await tx.soumissionLine.createMany({
        data: input.lines.map((line, index) => ({ soumissionId: id, label: line.label.trim(), amount: line.amount, sortOrder: index })),
      });
    }
    const updated = await tx.soumission.update({
      where: { id },
      data: { introText: input.introText?.trim() || undefined, termsText: input.termsText?.trim() || undefined },
      include: SOUMISSION_DETAIL_INCLUDE,
    });
    return toSoumissionDetailDto(updated);
  });
}

/** Gèle amountBeforeTax/tpsAmount/tvqAmount/totalWithTax via computeInvoiceTax — jamais recalculés après coup, même principe que InvoicePlanEntry. */
export async function sendSoumission(id: string): Promise<SoumissionDetailDto> {
  const soumission = await loadSoumissionOrThrow(id);
  if (soumission.status !== "draft") throw new HttpError(400, "Cette soumission a déjà été envoyée.");
  if (soumission.lines.length === 0) throw new HttpError(400, "Au moins une ligne est requise avant l'envoi.");

  const settings = await prisma.settings.findFirst();
  if (!settings) throw new HttpError(500, "Paramètres non initialisés — lancer le seed.");
  const amountBeforeTax = soumission.lines.reduce((sum, line) => sum + Number(line.amount), 0);
  const tax = computeInvoiceTax(amountBeforeTax, Number(settings.tpsRatePct), Number(settings.tvqRatePct));

  const updated = await prisma.soumission.update({
    where: { id },
    data: {
      status: "sent",
      sentAt: new Date(),
      amountBeforeTax: tax.amountBeforeTax,
      tpsAmount: tax.tpsAmount,
      tvqAmount: tax.tvqAmount,
      totalWithTax: tax.totalWithTax,
    },
    include: SOUMISSION_DETAIL_INCLUDE,
  });
  return toSoumissionDetailDto(updated);
}

export type SoumissionOutcome = "accepted" | "declined";

export async function decideSoumission(id: string, outcome: SoumissionOutcome): Promise<SoumissionDetailDto> {
  const soumission = await loadSoumissionOrThrow(id);
  if (soumission.status !== "sent") throw new HttpError(400, "Cette soumission doit d'abord être envoyée.");
  const updated = await prisma.soumission.update({
    where: { id },
    data: { status: outcome, decidedAt: new Date() },
    include: SOUMISSION_DETAIL_INCLUDE,
  });
  return toSoumissionDetailDto(updated);
}

/** Corbeille — même mécanisme que Budget/Project.deletedAt. */
export async function deleteSoumission(id: string): Promise<void> {
  await loadSoumissionOrThrow(id);
  await prisma.soumission.update({ where: { id }, data: { deletedAt: new Date() } });
}

export async function listSoumissionsForBudget(budgetId: string): Promise<SoumissionDetailDto[]> {
  const rows = await prisma.soumission.findMany({
    where: { budgetId, deletedAt: null },
    include: SOUMISSION_DETAIL_INCLUDE,
    orderBy: { createdAt: "desc" },
  });
  return rows.map(toSoumissionDetailDto);
}

export async function getSoumissionDetail(id: string): Promise<SoumissionDetailDto> {
  return toSoumissionDetailDto(await loadSoumissionOrThrow(id));
}
