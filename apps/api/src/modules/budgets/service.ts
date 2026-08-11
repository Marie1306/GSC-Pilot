/**
 * Budgétaire — création (via demande client existante ou nouvelle, créée à
 * la volée), calculateur 5 sections + back-up, cycle de statuts.
 *
 * Découverte en vérifiant le prototype v19 (12 août 2026) : il n'y a pas de
 * chemin de création vraiment indépendant — le même formulaire lie une
 * demande existante OU en crée une nouvelle automatiquement (« Sans
 * demande, l'application créera automatiquement le contact et la demande
 * client »). Réutilise donc createClientRequest tel quel plutôt que
 * d'inventer un deuxième mécanisme de contact/demande.
 *
 * Relation Budget ↔ ClientRequest : la relation Prisma gérée vit sur
 * ClientRequest.budgetId (@relation) — Budget.clientRequestId est une
 * colonne miroir simple (pas de @relation dessus), gardée synchronisée
 * manuellement ici pour rester cohérente avec l'autre sens.
 */
import {
  sectionSummary,
  backupSummary,
  budgetTotals,
  type SectionSummary,
  type BackupSummary,
} from "@gsc-pilot/business-rules";
import { prisma } from "../../db.js";
import { HttpError } from "../../middleware/errorHandler.js";
import { createClientRequest, type CreateClientRequestInput } from "../clientRequests/service.js";
import type { Budget, BudgetSection, BudgetRow } from "../../generated/prisma/client.js";

export const BUDGET_CATEGORIES = ["conception", "fabrication", "programmation", "assemblage", "installation"] as const;
export type BudgetCategoryValue = (typeof BUDGET_CATEGORIES)[number];

export const OUTCOME_STATUSES = ["sent", "won", "declined"] as const;

export interface NewClientRequestForBudget {
  company: string;
  contactName: string;
  contactRole?: string;
  phone: string;
  email: string;
  address?: string;
  requestType: "project" | "rolling" | "service";
  salesChannelId: string;
  sourceDetail?: string;
  summary: string;
}

export interface CreateBudgetInput {
  clientRequestId?: string;
  newClientRequest?: NewClientRequestForBudget;
}

export async function createBudget(createdById: string, input: CreateBudgetInput): Promise<Budget> {
  if (!input.clientRequestId && !input.newClientRequest) {
    throw new HttpError(400, "Une demande client existante ou de nouvelles informations client sont requises.");
  }
  if (input.clientRequestId && input.newClientRequest) {
    throw new HttpError(400, "Choisir une demande existante OU en créer une nouvelle, pas les deux.");
  }

  let clientRequestId = input.clientRequestId;
  if (input.newClientRequest) {
    const created = await createClientRequest(createdById, input.newClientRequest as CreateClientRequestInput);
    clientRequestId = created.id;
  }

  const clientRequest = await prisma.clientRequest.findUnique({ where: { id: clientRequestId } });
  if (!clientRequest) throw new HttpError(404, "Demande client introuvable.");
  if (clientRequest.budgetId) throw new HttpError(400, "Cette demande a déjà un budgétaire.");

  const model = await prisma.budgetModel.findFirst({ include: { sections: { include: { rows: { where: { active: true } } } } } });
  if (!model) throw new HttpError(500, "Modèle de budgétaire non initialisé — lancer le seed.");

  return prisma.$transaction(async (tx) => {
    const settings = await tx.settings.findFirst();
    if (!settings) throw new HttpError(500, "Paramètres non initialisés — lancer le seed.");
    const year = new Date().getFullYear();
    const displayId = `BG-${year}-${String(settings.nextBudgetNumber).padStart(4, "0")}`;

    const budget = await tx.budget.create({
      data: {
        displayId,
        clientRequestId,
        createdById,
        status: "draft",
        backupHourlyRate: model.backupHourlyRate,
        backupHoursPct: model.backupDefaultPct,
        backupHoursComplexity: 0,
      },
    });

    // Copie le modèle de budgétaire actuel (sections + lignes) vers ce
    // budgétaire réel — tous les taux GELÉS au moment de la création,
    // jamais recalculés si le modèle change ensuite (même principe que
    // backupHourlyRate ci-dessus).
    for (const modelSection of model.sections) {
      const section = await tx.budgetSection.create({
        data: {
          budgetId: budget.id,
          category: modelSection.category,
          hourlyRate: modelSection.rows[0]?.hourlyRate ?? 0,
          complexity: 0,
        },
      });
      for (const modelRow of modelSection.rows) {
        await tx.budgetRow.create({
          data: {
            sectionId: section.id,
            modelRowId: modelRow.id,
            label: modelRow.label,
            hourlyRate: modelRow.hourlyRate,
            hours: 0,
          },
        });
      }
    }

    await tx.clientRequest.update({ where: { id: clientRequestId }, data: { budgetId: budget.id } });
    await tx.settings.update({ where: { id: settings.id }, data: { nextBudgetNumber: settings.nextBudgetNumber + 1 } });

    return budget;
  });
}

type SectionWithRows = BudgetSection & { rows: BudgetRow[] };

function toSectionSummary(section: SectionWithRows): SectionSummary {
  return sectionSummary({
    category: section.category,
    complexity: section.complexity,
    rows: section.rows.map((row) => ({ hourlyRate: Number(row.hourlyRate), hours: Number(row.hours) })),
  });
}

function toBackupSummary(budget: Budget, sections: SectionWithRows[]): BackupSummary {
  // backup.ts filtre par section.id === nom de catégorie (fabrication/programmation/assemblage) —
  // adaptation : passer la catégorie comme "id", jamais le vrai identifiant de base de données.
  return backupSummary(
    {
      sections: sections.map((section) => ({
        id: section.category,
        rows: section.rows.map((row) => ({ hours: Number(row.hours) })),
      })),
      backupHourlyRate: Number(budget.backupHourlyRate),
      backupHoursPct: Number(budget.backupHoursPct),
      backupHoursComplexity: budget.backupHoursComplexity,
    },
    Number(budget.backupHourlyRate),
  );
}

export interface BudgetSectionDto extends SectionSummary {
  id: string;
  rows: { id: string; label: string; hourlyRate: number; hours: number }[];
}

export interface BudgetListItemDto {
  id: string;
  displayId: string;
  status: string;
  contactName: string;
  company: string | null;
  createdByName: string;
  createdAt: string;
  totalSale: number;
}

export interface BudgetDetailDto extends BudgetListItemDto {
  backupHourlyRate: number;
  backupHoursPct: number;
  backupHoursComplexity: number;
  clientRequestId: string | null;
  sentAt: string | null;
  contractWonAt: string | null;
  sections: BudgetSectionDto[];
  backup: BackupSummary;
  totals: { totalHours: number; totalBaseCost: number; totalSale: number };
}

async function namesByEmployeeId(ids: string[]): Promise<Map<string, string>> {
  const uniqueIds = [...new Set(ids)];
  const employees = await prisma.employee.findMany({ where: { id: { in: uniqueIds } }, select: { id: true, name: true } });
  return new Map(employees.map((employee) => [employee.id, employee.name]));
}

export async function getBudgetDetail(id: string): Promise<BudgetDetailDto> {
  const budget = await prisma.budget.findUnique({
    where: { id },
    include: { sections: { include: { rows: true } }, clientRequest: true },
  });
  if (!budget) throw new HttpError(404, "Budgétaire introuvable.");

  const sections = budget.sections as SectionWithRows[];
  const sectionSummaries = sections.map(toSectionSummary);
  const backup = toBackupSummary(budget, sections);
  const totals = budgetTotals(sectionSummaries, backup);
  const nameById = await namesByEmployeeId([budget.createdById]);

  return {
    id: budget.id,
    displayId: budget.displayId,
    status: budget.status,
    contactName: budget.clientRequest?.contactName ?? "—",
    company: budget.clientRequest?.company ?? null,
    createdByName: nameById.get(budget.createdById) ?? "—",
    createdAt: budget.createdAt.toISOString(),
    totalSale: totals.totalSale,
    backupHourlyRate: Number(budget.backupHourlyRate),
    backupHoursPct: Number(budget.backupHoursPct),
    backupHoursComplexity: budget.backupHoursComplexity,
    clientRequestId: budget.clientRequestId,
    sentAt: budget.sentAt?.toISOString() ?? null,
    contractWonAt: budget.contractWonAt?.toISOString() ?? null,
    sections: sections
      .sort((a, b) => BUDGET_CATEGORIES.indexOf(a.category as BudgetCategoryValue) - BUDGET_CATEGORIES.indexOf(b.category as BudgetCategoryValue))
      .map((section) => ({
        ...toSectionSummary(section),
        id: section.id,
        rows: section.rows.map((row) => ({ id: row.id, label: row.label, hourlyRate: Number(row.hourlyRate), hours: Number(row.hours) })),
      })),
    backup,
    totals,
  };
}

export async function listBudgets(): Promise<BudgetListItemDto[]> {
  const budgets = await prisma.budget.findMany({
    include: { sections: { include: { rows: true } }, clientRequest: true },
    orderBy: { createdAt: "desc" },
  });
  const nameById = await namesByEmployeeId(budgets.map((budget) => budget.createdById));

  return budgets.map((budget) => {
    const sections = budget.sections as SectionWithRows[];
    const sectionSummaries = sections.map(toSectionSummary);
    const backup = toBackupSummary(budget, sections);
    const totals = budgetTotals(sectionSummaries, backup);
    return {
      id: budget.id,
      displayId: budget.displayId,
      status: budget.status,
      contactName: budget.clientRequest?.contactName ?? "—",
      company: budget.clientRequest?.company ?? null,
      createdByName: nameById.get(budget.createdById) ?? "—",
      createdAt: budget.createdAt.toISOString(),
      totalSale: totals.totalSale,
    };
  });
}

async function assertBudgetExists(id: string): Promise<Budget> {
  const budget = await prisma.budget.findUnique({ where: { id } });
  if (!budget) throw new HttpError(404, "Budgétaire introuvable.");
  return budget;
}

export async function updateRowHours(budgetId: string, rowId: string, hours: number): Promise<void> {
  await assertBudgetExists(budgetId);
  const row = await prisma.budgetRow.findUnique({ where: { id: rowId }, include: { section: true } });
  if (!row || row.section.budgetId !== budgetId) throw new HttpError(404, "Ligne introuvable pour ce budgétaire.");
  await prisma.budgetRow.update({ where: { id: rowId }, data: { hours } });
}

export async function updateSectionComplexity(budgetId: string, sectionId: string, complexity: number): Promise<void> {
  await assertBudgetExists(budgetId);
  const section = await prisma.budgetSection.findUnique({ where: { id: sectionId } });
  if (!section || section.budgetId !== budgetId) throw new HttpError(404, "Section introuvable pour ce budgétaire.");
  await prisma.budgetSection.update({ where: { id: sectionId }, data: { complexity: Math.max(0, Math.min(10, complexity)) } });
}

export async function updateBackupSettings(budgetId: string, patch: { pct?: number; complexity?: number }): Promise<void> {
  await assertBudgetExists(budgetId);
  await prisma.budget.update({
    where: { id: budgetId },
    data: {
      ...(patch.pct !== undefined ? { backupHoursPct: patch.pct } : {}),
      ...(patch.complexity !== undefined ? { backupHoursComplexity: Math.max(0, Math.min(10, patch.complexity)) } : {}),
    },
  });
}

export async function markBudgetReady(id: string): Promise<Budget> {
  const budget = await assertBudgetExists(id);
  if (budget.status !== "draft") throw new HttpError(400, "Seul un budgétaire en brouillon peut être marqué prêt.");
  return prisma.budget.update({ where: { id }, data: { status: "ready" } });
}

export async function markBudgetSent(id: string): Promise<Budget> {
  const budget = await assertBudgetExists(id);
  if (budget.status !== "ready") throw new HttpError(400, "Seul un budgétaire prêt peut être marqué envoyé.");
  return prisma.budget.update({ where: { id }, data: { status: "sent", sentAt: new Date() } });
}

export async function markBudgetWon(id: string): Promise<Budget> {
  const budget = await assertBudgetExists(id);
  if (budget.status !== "sent") throw new HttpError(400, "Seul un budgétaire envoyé peut être marqué Contrat obtenu.");
  return prisma.budget.update({ where: { id }, data: { status: "won", contractWonAt: new Date() } });
}

export async function markBudgetDeclined(id: string): Promise<Budget> {
  const budget = await assertBudgetExists(id);
  if (budget.status !== "sent") throw new HttpError(400, "Seul un budgétaire envoyé peut être marqué refusé.");
  return prisma.budget.update({ where: { id }, data: { status: "declined" } });
}
