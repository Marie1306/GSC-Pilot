/**
 * GSC Pilot — Trésorerie (nouveau module, 13 novembre 2026)
 *
 * Prérequis dur : la refonte de la demande de facturation (projects/
 * service.ts — numéro/taxes/échéance générés par l'appli) devait exister
 * avant ce module, puisque le déclencheur du prévisionnel ("quand j'envoie
 * une facture, elle entre dans le flux 30 jours plus tard") en dépend.
 *
 * Toute la logique de calcul (bascule chèque/marge, expansion des dépenses
 * récurrentes, construction du tableau semaine par semaine) vit dans
 * packages/business-rules/src/treasury.ts, pure et déjà testée — ce fichier
 * ne fait que charger les données Prisma et les mettre en forme pour cette
 * logique, jamais une deuxième règle de calcul ici.
 *
 * Ré-bascule automatique au paiement (demande explicite de l'utilisatrice,
 * exemple chiffré donné : facture due le 30 septembre, payée le 13 →
 * l'échéance disparaît de sa semaine, le montant apparaît dans la semaine du
 * 13) : date effective = paidAt si le solde est nul, sinon dueDate — jamais
 * les deux en même temps dans le tableau.
 */
import {
  buildForecastTable,
  resolveRecurringOccurrences,
  type ForecastWeekRow,
  type ConfirmedInvoiceEvent,
} from "@gsc-pilot/business-rules";
import { prisma } from "../../db.js";
import { HttpError } from "../../middleware/errorHandler.js";
import { INVOICE_ENTRY_SOURCE_INCLUDE, resolveInvoiceEntrySource } from "../invoicing/service.js";
import { setInvoicePlanEntryForecastDate as setForecastDateOnEntry } from "../projects/service.js";

const DEFAULT_WEEK_COUNT = 13;
const MAX_WEEK_COUNT = 26; // ~6 mois, horizon modifiable confirmé

export { setForecastDateOnEntry as setInvoicePlanEntryForecastDate };

// ---------------------------------------------------------------------------
// Soldes d'ouverture + seuil de bascule (singleton, même patron que Settings)
// ---------------------------------------------------------------------------

export interface TreasurySettingsDto {
  checkingOpeningBalance: number;
  checkingOpeningDate: string;
  locOpeningBalance: number;
  locOpeningDate: string;
  sweepThreshold: number;
  locCreditLimit: number;
}

function toTreasurySettingsDto(row: {
  checkingOpeningBalance: unknown;
  checkingOpeningDate: Date;
  locOpeningBalance: unknown;
  locOpeningDate: Date;
  sweepThreshold: unknown;
  locCreditLimit: unknown;
}): TreasurySettingsDto {
  return {
    checkingOpeningBalance: Number(row.checkingOpeningBalance),
    checkingOpeningDate: row.checkingOpeningDate.toISOString().slice(0, 10),
    locOpeningBalance: Number(row.locOpeningBalance),
    locOpeningDate: row.locOpeningDate.toISOString().slice(0, 10),
    sweepThreshold: Number(row.sweepThreshold),
    locCreditLimit: Number(row.locCreditLimit),
  };
}

export async function getTreasurySettings(): Promise<TreasurySettingsDto | null> {
  const row = await prisma.treasurySettings.findFirst();
  return row ? toTreasurySettingsDto(row) : null;
}

export interface UpsertTreasurySettingsInput {
  checkingOpeningBalance: number;
  checkingOpeningDate: string;
  locOpeningBalance: number;
  locOpeningDate: string;
  sweepThreshold: number;
  locCreditLimit: number;
}

/** Pas encore de ligne la première fois que Marie configure la Trésorerie (table neuve, jamais seedée) — créée à la première sauvegarde, mise à jour ensuite. */
export async function upsertTreasurySettings(input: UpsertTreasurySettingsInput): Promise<TreasurySettingsDto> {
  if (input.locCreditLimit <= 0) throw new HttpError(400, "Le plafond de la marge de crédit doit être positif.");
  const existing = await prisma.treasurySettings.findFirst();
  const data = {
    checkingOpeningBalance: input.checkingOpeningBalance,
    checkingOpeningDate: new Date(input.checkingOpeningDate),
    locOpeningBalance: input.locOpeningBalance,
    locOpeningDate: new Date(input.locOpeningDate),
    sweepThreshold: input.sweepThreshold,
    locCreditLimit: input.locCreditLimit,
  };
  const row = existing
    ? await prisma.treasurySettings.update({ where: { id: existing.id }, data })
    : await prisma.treasurySettings.create({ data });
  return toTreasurySettingsDto(row);
}

// ---------------------------------------------------------------------------
// Dépenses récurrentes
// ---------------------------------------------------------------------------

export type RecurringExpenseFrequency = "monthly" | "weekly";

export interface RecurringExpenseOverrideDto {
  yearMonth: string;
  amount: number;
}
export interface RecurringExpenseDto {
  id: string;
  label: string;
  frequency: RecurringExpenseFrequency;
  dayOfMonth: number | null;
  dayOfWeek: number | null;
  defaultAmount: number;
  active: boolean;
  overrides: RecurringExpenseOverrideDto[];
}

function toRecurringExpenseDto(row: {
  id: string;
  label: string;
  frequency: string;
  dayOfMonth: number | null;
  dayOfWeek: number | null;
  defaultAmount: unknown;
  active: boolean;
  overrides: { yearMonth: string; amount: unknown }[];
}): RecurringExpenseDto {
  return {
    id: row.id,
    label: row.label,
    frequency: row.frequency === "weekly" ? "weekly" : "monthly",
    dayOfMonth: row.dayOfMonth,
    dayOfWeek: row.dayOfWeek,
    defaultAmount: Number(row.defaultAmount),
    active: row.active,
    overrides: row.overrides.map((o) => ({ yearMonth: o.yearMonth, amount: Number(o.amount) })),
  };
}

export async function listRecurringExpenses(): Promise<RecurringExpenseDto[]> {
  const rows = await prisma.recurringExpense.findMany({
    where: { deletedAt: null },
    include: { overrides: true },
    orderBy: { label: "asc" },
  });
  return rows.map(toRecurringExpenseDto);
}

/** defaultAmount : TOUJOURS positif (confirmé — "une dépense récurrente est une sortie de fonds"), jamais une convention de signe ici. */
function assertValidFrequencyFields(frequency: RecurringExpenseFrequency, dayOfMonth: number | undefined, dayOfWeek: number | undefined): void {
  if (frequency === "monthly") {
    if (dayOfMonth === undefined || dayOfMonth < 1 || dayOfMonth > 31) throw new HttpError(400, "Le jour du mois doit être entre 1 et 31.");
  } else {
    if (dayOfWeek === undefined || dayOfWeek < 1 || dayOfWeek > 7) throw new HttpError(400, "Le jour de la semaine doit être entre 1 (lundi) et 7 (dimanche).");
  }
}

export interface CreateRecurringExpenseInput {
  label: string;
  frequency: RecurringExpenseFrequency;
  dayOfMonth?: number;
  dayOfWeek?: number;
  defaultAmount: number;
}

export async function createRecurringExpense(input: CreateRecurringExpenseInput): Promise<RecurringExpenseDto> {
  assertValidFrequencyFields(input.frequency, input.dayOfMonth, input.dayOfWeek);
  if (input.defaultAmount <= 0) throw new HttpError(400, "Le montant doit être positif — une dépense récurrente est toujours une sortie de fonds.");
  const row = await prisma.recurringExpense.create({
    data: {
      label: input.label.trim(),
      frequency: input.frequency,
      dayOfMonth: input.frequency === "monthly" ? input.dayOfMonth : null,
      dayOfWeek: input.frequency === "weekly" ? input.dayOfWeek : null,
      defaultAmount: input.defaultAmount,
    },
    include: { overrides: true },
  });
  return toRecurringExpenseDto(row);
}

export interface UpdateRecurringExpenseInput {
  label?: string;
  frequency?: RecurringExpenseFrequency;
  dayOfMonth?: number;
  dayOfWeek?: number;
  defaultAmount?: number;
  active?: boolean;
}

export async function updateRecurringExpense(id: string, input: UpdateRecurringExpenseInput): Promise<RecurringExpenseDto> {
  if (input.frequency) {
    assertValidFrequencyFields(input.frequency, input.dayOfMonth, input.dayOfWeek);
  } else {
    if (input.dayOfMonth !== undefined && (input.dayOfMonth < 1 || input.dayOfMonth > 31)) {
      throw new HttpError(400, "Le jour du mois doit être entre 1 et 31.");
    }
    if (input.dayOfWeek !== undefined && (input.dayOfWeek < 1 || input.dayOfWeek > 7)) {
      throw new HttpError(400, "Le jour de la semaine doit être entre 1 (lundi) et 7 (dimanche).");
    }
  }
  if (input.defaultAmount !== undefined && input.defaultAmount <= 0) {
    throw new HttpError(400, "Le montant doit être positif — une dépense récurrente est toujours une sortie de fonds.");
  }
  const row = await prisma.recurringExpense.update({
    where: { id },
    data: {
      ...input,
      label: input.label?.trim(),
      // Changer de fréquence efface le jour de l'autre fréquence — jamais un dayOfMonth fantôme sur une dépense devenue hebdomadaire, ou l'inverse.
      ...(input.frequency === "monthly" ? { dayOfWeek: null } : {}),
      ...(input.frequency === "weekly" ? { dayOfMonth: null } : {}),
    },
    include: { overrides: true },
  });
  return toRecurringExpenseDto(row);
}

/** Corbeille — même mécanisme que les autres modules (deletedAt), jamais une vraie suppression. */
export async function deleteRecurringExpense(id: string): Promise<void> {
  await prisma.recurringExpense.update({ where: { id }, data: { deletedAt: new Date() } });
}

/** Remplace le montant d'UN mois précis (ex. prime d'assurance variable) — jamais les autres mois (voir resolveRecurringOccurrences, business-rules). Mensuel seulement — jamais demandé pour une dépense hebdomadaire (salaires, etc.). */
export async function setRecurringExpenseOverride(recurringExpenseId: string, yearMonth: string, amount: number): Promise<RecurringExpenseDto> {
  if (amount <= 0) throw new HttpError(400, "Le montant doit être positif — une dépense récurrente est toujours une sortie de fonds.");
  const expense = await prisma.recurringExpense.findUniqueOrThrow({ where: { id: recurringExpenseId } });
  if (expense.frequency !== "monthly") throw new HttpError(400, "Un ajustement ponctuel n'est offert que pour une dépense mensuelle.");
  await prisma.recurringExpenseOverride.upsert({
    where: { recurringExpenseId_yearMonth: { recurringExpenseId, yearMonth } },
    create: { recurringExpenseId, yearMonth, amount },
    update: { amount },
  });
  const row = await prisma.recurringExpense.findUniqueOrThrow({ where: { id: recurringExpenseId }, include: { overrides: true } });
  return toRecurringExpenseDto(row);
}

export async function clearRecurringExpenseOverride(recurringExpenseId: string, yearMonth: string): Promise<RecurringExpenseDto> {
  await prisma.recurringExpenseOverride.deleteMany({ where: { recurringExpenseId, yearMonth } });
  const row = await prisma.recurringExpense.findUniqueOrThrow({ where: { id: recurringExpenseId }, include: { overrides: true } });
  return toRecurringExpenseDto(row);
}

// ---------------------------------------------------------------------------
// Entrées ponctuelles
// ---------------------------------------------------------------------------

export interface ManualEntryDto {
  id: string;
  label: string;
  amount: number;
  date: string;
}

function toManualEntryDto(row: { id: string; label: string; amount: unknown; date: Date }): ManualEntryDto {
  return { id: row.id, label: row.label, amount: Number(row.amount), date: row.date.toISOString().slice(0, 10) };
}

export async function listManualEntries(): Promise<ManualEntryDto[]> {
  const rows = await prisma.treasuryManualEntry.findMany({ where: { deletedAt: null }, orderBy: { date: "asc" } });
  return rows.map(toManualEntryDto);
}

export interface CreateManualEntryInput {
  label: string;
  amount: number;
  date: string;
}

export async function createManualEntry(input: CreateManualEntryInput, createdById: string): Promise<ManualEntryDto> {
  if (input.amount === 0) throw new HttpError(400, "Le montant ne peut pas être zéro.");
  const row = await prisma.treasuryManualEntry.create({
    data: { label: input.label.trim(), amount: input.amount, date: new Date(input.date), createdById },
  });
  return toManualEntryDto(row);
}

export async function deleteManualEntry(id: string): Promise<void> {
  await prisma.treasuryManualEntry.update({ where: { id }, data: { deletedAt: new Date() } });
}

// ---------------------------------------------------------------------------
// Prévisionnel 13 semaines
// ---------------------------------------------------------------------------

export async function getForecastTable(weekCount: number = DEFAULT_WEEK_COUNT): Promise<ForecastWeekRow[]> {
  const clampedWeeks = Math.max(1, Math.min(MAX_WEEK_COUNT, weekCount));
  const settings = await prisma.treasurySettings.findFirst();
  if (!settings) throw new HttpError(400, "Configure d'abord les soldes d'ouverture de la Trésorerie.");

  const anchorDate = new Date();
  anchorDate.setHours(0, 0, 0, 0);
  const horizonEnd = new Date(anchorDate);
  horizonEnd.setDate(horizonEnd.getDate() + clampedWeeks * 7);

  const invoiceRows = await prisma.invoicePlanEntry.findMany({
    where: { requestedAt: { not: null } },
    include: INVOICE_ENTRY_SOURCE_INCLUDE,
  });
  // Ré-bascule au paiement (demandé explicitement) : date effective =
  // paidAt si le solde est nul, sinon dueDate — jamais les deux à la fois.
  const confirmedInvoices: ConfirmedInvoiceEvent[] = invoiceRows
    .filter((row) => !resolveInvoiceEntrySource(row).sourceDeleted)
    .map((row) => {
      const total = Number(row.totalWithTax ?? row.amount);
      const balance = total - Number(row.paidAmount);
      const effectiveDate = balance <= 0.005 && row.paidAt ? row.paidAt : row.dueDate;
      const source = resolveInvoiceEntrySource(row);
      return effectiveDate
        ? { date: effectiveDate, amount: total, invoiceNumber: row.invoiceNumber ?? "—", sourceLabel: source.sourceLabel, clientLabel: source.clientLabel }
        : null;
    })
    .filter((event): event is ConfirmedInvoiceEvent => event !== null);

  const expenses = await prisma.recurringExpense.findMany({ where: { deletedAt: null, active: true }, include: { overrides: true } });
  const recurringOccurrences = expenses.flatMap((expense) =>
    resolveRecurringOccurrences(
      {
        label: expense.label,
        frequency: expense.frequency === "weekly" ? "weekly" : "monthly",
        dayOfMonth: expense.dayOfMonth,
        dayOfWeek: expense.dayOfWeek,
        defaultAmount: Number(expense.defaultAmount),
      },
      expense.overrides.map((o) => ({ yearMonth: o.yearMonth, amount: Number(o.amount) })),
      anchorDate,
      horizonEnd,
    ),
  );

  const manualRows = await prisma.treasuryManualEntry.findMany({ where: { deletedAt: null } });
  const manualEntries = manualRows.map((row) => ({ date: row.date, amount: Number(row.amount), label: row.label }));

  return buildForecastTable({
    weekCount: clampedWeeks,
    anchorDate,
    checkingOpeningBalance: Number(settings.checkingOpeningBalance),
    locOpeningBalance: Number(settings.locOpeningBalance),
    sweepThreshold: Number(settings.sweepThreshold),
    locCreditLimit: Number(settings.locCreditLimit),
    confirmedInvoices,
    recurringOccurrences,
    manualEntries,
  });
}

// ---------------------------------------------------------------------------
// Prévisionnel — jalons pas encore facturés (Partie 3)
// ---------------------------------------------------------------------------

export interface PendingForecastEntryDto {
  id: string;
  sourceLabel: string;
  clientLabel: string;
  amount: number;
  /** forecastDate manuelle si fixée, sinon la date de livraison prévue du dossier parent, sinon null ("non daté"). */
  effectiveDate: string | null;
  isManualDate: boolean;
}

/**
 * Jalons encore pending (pas encore demandés) — ordre de priorité de la date
 * confirmé par Marie : forecastDate manuelle (fixée directement depuis la
 * Trésorerie) > date de livraison prévue du dossier parent > "non daté",
 * jamais une semaine devinée au hasard pour ce dernier cas.
 */
export async function listPendingInvoiceEntriesForForecast(): Promise<PendingForecastEntryDto[]> {
  const rows = await prisma.invoicePlanEntry.findMany({
    where: { requestedAt: null },
    include: INVOICE_ENTRY_SOURCE_INCLUDE,
    orderBy: { createdAt: "asc" },
  });

  return rows
    .map((row) => {
      const source = resolveInvoiceEntrySource(row);
      if (source.sourceDeleted) return null;
      const effectiveDate = row.forecastDate ?? source.parentScheduledDate;
      return {
        id: row.id,
        sourceLabel: source.sourceLabel,
        clientLabel: source.clientLabel,
        amount: Number(row.amount),
        effectiveDate: effectiveDate ? effectiveDate.toISOString().slice(0, 10) : null,
        isManualDate: row.forecastDate !== null,
      };
    })
    .filter((entry): entry is PendingForecastEntryDto => entry !== null);
}
