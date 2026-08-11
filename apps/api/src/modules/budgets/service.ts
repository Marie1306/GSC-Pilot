/**
 * Budgétaire — création (via demande client existante ou nouvelle, créée à
 * la volée), calculateur 8 sections + achats par ligne + back-up d'heures +
 * back-up projet, cycle de statuts.
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
 *
 * Deuxième vérification (12 août 2026, après un premier retour de
 * l'utilisatrice — « très loin d'être complet ») : le vrai calculateur v19
 * (fonctions ms()/vs(), effectivement câblées à l'écran budget) a 8
 * catégories (pas 5), un montant d'achat direct par ligne en plus des
 * heures × taux, des sections « modulables » où Direction ajoute/retire des
 * lignes, une note de risque par ligne, et des champs d'en-tête (PO client,
 * quantité, validité, résumés). Le back-up affiché dans cet écran est un
 * montant $ saisi à la main — confirmé avec l'utilisatrice que c'est un
 * BACK-UP PROJET distinct du BACK-UP D'HEURES (backup.ts, déjà construit et
 * vérifié) : les deux réserves coexistent dans le même budgétaire, jamais
 * l'une à la place de l'autre.
 */
import {
  sectionSummary,
  backupSummary,
  projectBackupSummary,
  budgetTotals,
  type SectionSummary,
  type BackupSummary,
  type ProjectBackupSummary,
} from "@gsc-pilot/business-rules";
import { prisma } from "../../db.js";
import { HttpError } from "../../middleware/errorHandler.js";
import { createClientRequest, type CreateClientRequestInput } from "../clientRequests/service.js";
import type { Budget, BudgetSection, BudgetRow } from "../../generated/prisma/client.js";

export const BUDGET_CATEGORIES = [
  "conception",
  "fabrication",
  "programmation",
  "assemblage",
  "installation",
  "stock",
  "sousTraitance",
  "deplacements",
] as const;
export type BudgetCategoryValue = (typeof BUDGET_CATEGORIES)[number];

/** Sections où Direction peut ajouter/retirer des lignes — les autres ont une composition fixe (vérifié v19, 12 août 2026). */
export const MODULAR_CATEGORIES = ["fabrication", "programmation", "assemblage", "sousTraitance", "deplacements"] as const;

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
        projectBackupAmount: 0,
        projectBackupComplexity: 0,
      },
    });

    // Copie le modèle de budgétaire actuel (sections + lignes) vers ce
    // budgétaire réel — tous les taux/montants d'achat GELÉS au moment de la
    // création, jamais recalculés si le modèle change ensuite (même
    // principe que backupHourlyRate ci-dessus).
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
            purchaseAmount: modelRow.purchaseAmount,
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
    rows: section.rows.map((row) => ({ hourlyRate: Number(row.hourlyRate), hours: Number(row.hours), purchaseAmount: Number(row.purchaseAmount) })),
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

function toProjectBackupSummary(budget: Budget): ProjectBackupSummary {
  return projectBackupSummary(Number(budget.projectBackupAmount), budget.projectBackupComplexity);
}

export interface BudgetSectionDto extends SectionSummary {
  id: string;
  rows: { id: string; label: string; hourlyRate: number; hours: number; purchaseAmount: number; risk: string | null }[];
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
  projectBackupAmount: number;
  projectBackupComplexity: number;
  poNumber: string | null;
  quantity: number;
  validUntil: string | null;
  summary: string | null;
  riskSummary: string | null;
  clientRequestId: string | null;
  clientRequestDisplayId: string | null;
  sentAt: string | null;
  contractWonAt: string | null;
  sections: BudgetSectionDto[];
  backup: BackupSummary;
  projectBackup: ProjectBackupSummary;
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
  const projectBackup = toProjectBackupSummary(budget);
  const totals = budgetTotals(sectionSummaries, backup, projectBackup);
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
    projectBackupAmount: Number(budget.projectBackupAmount),
    projectBackupComplexity: budget.projectBackupComplexity,
    poNumber: budget.poNumber,
    quantity: budget.quantity,
    validUntil: budget.validUntil?.toISOString() ?? null,
    summary: budget.summary,
    riskSummary: budget.riskSummary,
    clientRequestId: budget.clientRequestId,
    clientRequestDisplayId: budget.clientRequest?.displayId ?? null,
    sentAt: budget.sentAt?.toISOString() ?? null,
    contractWonAt: budget.contractWonAt?.toISOString() ?? null,
    sections: sections
      .sort((a, b) => BUDGET_CATEGORIES.indexOf(a.category as BudgetCategoryValue) - BUDGET_CATEGORIES.indexOf(b.category as BudgetCategoryValue))
      .map((section) => ({
        ...toSectionSummary(section),
        id: section.id,
        rows: section.rows.map((row) => ({
          id: row.id,
          label: row.label,
          hourlyRate: Number(row.hourlyRate),
          hours: Number(row.hours),
          purchaseAmount: Number(row.purchaseAmount),
          risk: row.risk,
        })),
      })),
    backup,
    projectBackup,
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
    const projectBackup = toProjectBackupSummary(budget);
    const totals = budgetTotals(sectionSummaries, backup, projectBackup);
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

async function assertSectionOfBudget(budgetId: string, sectionId: string): Promise<BudgetSection> {
  const section = await prisma.budgetSection.findUnique({ where: { id: sectionId } });
  if (!section || section.budgetId !== budgetId) throw new HttpError(404, "Section introuvable pour ce budgétaire.");
  return section;
}

export interface UpdateRowPatch {
  hours?: number;
  purchaseAmount?: number;
  risk?: string | null;
}

export async function updateRow(budgetId: string, rowId: string, patch: UpdateRowPatch): Promise<void> {
  await assertBudgetExists(budgetId);
  const row = await prisma.budgetRow.findUnique({ where: { id: rowId }, include: { section: true } });
  if (!row || row.section.budgetId !== budgetId) throw new HttpError(404, "Ligne introuvable pour ce budgétaire.");
  await prisma.budgetRow.update({
    where: { id: rowId },
    data: {
      ...(patch.hours !== undefined ? { hours: patch.hours } : {}),
      ...(patch.purchaseAmount !== undefined ? { purchaseAmount: patch.purchaseAmount } : {}),
      ...(patch.risk !== undefined ? { risk: patch.risk?.trim() || null } : {}),
    },
  });
}

export interface AddBudgetRowInput {
  label: string;
  hourlyRate?: number;
  purchaseAmount?: number;
}

export async function addBudgetRow(budgetId: string, sectionId: string, input: AddBudgetRowInput): Promise<{ id: string }> {
  await assertBudgetExists(budgetId);
  const section = await assertSectionOfBudget(budgetId, sectionId);
  if (!(MODULAR_CATEGORIES as readonly string[]).includes(section.category)) {
    throw new HttpError(400, "Cette section n'accepte pas de lignes ajoutées manuellement.");
  }
  const row = await prisma.budgetRow.create({
    data: {
      sectionId,
      modelRowId: null,
      label: input.label.trim(),
      hourlyRate: input.hourlyRate ?? 0,
      purchaseAmount: input.purchaseAmount ?? 0,
      hours: 0,
    },
  });
  return { id: row.id };
}

export async function removeBudgetRow(budgetId: string, rowId: string): Promise<void> {
  await assertBudgetExists(budgetId);
  const row = await prisma.budgetRow.findUnique({ where: { id: rowId }, include: { section: { include: { rows: true } } } });
  if (!row || row.section.budgetId !== budgetId) throw new HttpError(404, "Ligne introuvable pour ce budgétaire.");
  if (!(MODULAR_CATEGORIES as readonly string[]).includes(row.section.category)) {
    throw new HttpError(400, "Cette section n'accepte pas le retrait de lignes.");
  }
  if (row.section.rows.length <= 1) {
    throw new HttpError(400, "Impossible de retirer la dernière ligne d'une section.");
  }
  await prisma.budgetRow.delete({ where: { id: rowId } });
}

export async function updateSectionComplexity(budgetId: string, sectionId: string, complexity: number): Promise<void> {
  await assertBudgetExists(budgetId);
  await assertSectionOfBudget(budgetId, sectionId);
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

/** Back-up PROJET — montant saisi à la main, distinct du back-up d'heures ci-dessus (confirmé le 12 août 2026). */
export async function updateProjectBackup(budgetId: string, patch: { amount?: number; complexity?: number }): Promise<void> {
  await assertBudgetExists(budgetId);
  await prisma.budget.update({
    where: { id: budgetId },
    data: {
      ...(patch.amount !== undefined ? { projectBackupAmount: Math.max(0, patch.amount) } : {}),
      ...(patch.complexity !== undefined ? { projectBackupComplexity: Math.max(0, Math.min(10, patch.complexity)) } : {}),
    },
  });
}

export interface UpdateBudgetMetaInput {
  poNumber?: string | null;
  quantity?: number;
  validUntil?: string | null;
  summary?: string | null;
  riskSummary?: string | null;
}

export async function updateBudgetMeta(budgetId: string, patch: UpdateBudgetMetaInput): Promise<void> {
  await assertBudgetExists(budgetId);
  await prisma.budget.update({
    where: { id: budgetId },
    data: {
      ...(patch.poNumber !== undefined ? { poNumber: patch.poNumber?.trim() || null } : {}),
      ...(patch.quantity !== undefined ? { quantity: Math.max(1, patch.quantity) } : {}),
      ...(patch.validUntil !== undefined ? { validUntil: patch.validUntil ? new Date(patch.validUntil) : null } : {}),
      ...(patch.summary !== undefined ? { summary: patch.summary?.trim() || null } : {}),
      ...(patch.riskSummary !== undefined ? { riskSummary: patch.riskSummary?.trim() || null } : {}),
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
