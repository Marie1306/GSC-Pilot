/**
 * Budgétaire — création (via demande client existante ou nouvelle, créée à
 * la volée), calculateur 13 catégories (2 types de ligne) + back-up
 * d'heures + back-up projet, cycle de statuts.
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
 * Deuxième vérification (12 août 2026, après un retour de l'utilisatrice —
 * « très loin d'être complet », puis des captures d'écran catégorie par
 * catégorie du vrai prototype) : 13 catégories réelles (pas 8), réparties en
 * 3 groupes visuels (voir BUDGET_GROUPS côté application) ; deux types de
 * ligne — "labor" (heures × taux) et "purchase" (quantité × prix unitaire),
 * jamais mélangés dans une même section ; certaines lignes calculées
 * automatiquement à partir d'une autre ligne (ex. « Conception plus 10 % »),
 * jamais saisies directement ; l'éditabilité varie PAR LIGNE (Direction
 * seulement vs Direction ET Propriétaire), pas seulement par catégorie ; le
 * résumé et le résumé des risques sont obligatoires avant de marquer un
 * budgétaire prêt. Le back-up d'heures (calculé automatiquement) et le
 * back-up projet (montant saisi à la main) sont deux réserves distinctes qui
 * coexistent toujours dans le même budgétaire.
 */
import {
  sectionSummary,
  backupSummary,
  projectBackupSummary,
  budgetTotals,
  effectiveRowHours,
  canModifyBudget,
  canModifyBudgetPurchaseLine,
  type SectionSummary,
  type BackupSummary,
  type ProjectBackupSummary,
  type Persona,
} from "@gsc-pilot/business-rules";
import { prisma } from "../../db.js";
import { HttpError } from "../../middleware/errorHandler.js";
import { createClientRequest, type CreateClientRequestInput } from "../clientRequests/service.js";
import type { Budget, BudgetSection, BudgetRow, BudgetSectionKind } from "../../generated/prisma/client.js";

/** Ordre d'affichage — 3 groupes vérifiés dans le prototype v19 (12 août 2026), voir BUDGET_GROUPS côté application pour les libellés. */
export const BUDGET_CATEGORIES = [
  "conception",
  "fabrication",
  "panelProgramming",
  "assemblyTest",
  "installationLabor",
  "stockFabrication",
  "stockPanel",
  "motorization",
  "hardware",
  "consumables",
  "subcontracting",
  "installationStock",
  "installationExpenses",
] as const;
export type BudgetCategoryValue = (typeof BUDGET_CATEGORIES)[number];

/** Sections où Direction peut ajouter/retirer des lignes — aucune section "labor" n'est modulable (vérifié v19, 12 août 2026). */
export const MODULAR_CATEGORIES = ["stockFabrication", "stockPanel", "motorization", "hardware", "subcontracting", "installationStock"] as const;

/** backup.ts (jamais modifié) attend "fabrication"/"programmation"/"assemblage" — adapte nos vrais noms de catégorie vers ce vocabulaire figé. */
const BACKUP_ELIGIBLE_ALIAS: Partial<Record<BudgetCategoryValue, string>> = {
  fabrication: "fabrication",
  panelProgramming: "programmation",
  assemblyTest: "assemblage",
};

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
    // budgétaire réel — tous les taux/prix/permissions GELÉS au moment de la
    // création, jamais recalculés si le modèle change ensuite (même
    // principe que backupHourlyRate ci-dessus). Deuxième passe pour
    // résoudre les lignes calculées automatiquement (ex. « Conception plus
    // 10 % ») une fois que toutes les lignes ont un vrai id — même
    // technique que scripts/seed.ts.
    const rowIdByModelRowId = new Map<string, string>();
    for (const modelSection of model.sections) {
      const section = await tx.budgetSection.create({
        data: { budgetId: budget.id, category: modelSection.category, kind: modelSection.kind, complexity: 0 },
      });
      for (const modelRow of modelSection.rows) {
        const row = await tx.budgetRow.create({
          data: {
            sectionId: section.id,
            modelRowId: modelRow.id,
            label: modelRow.label,
            hourlyRate: modelRow.hourlyRate,
            unitPrice: modelRow.unitPrice,
            directionOnly: modelRow.directionOnly,
            hours: 0,
            qty: 0,
          },
        });
        rowIdByModelRowId.set(modelRow.id, row.id);
      }
    }
    for (const modelSection of model.sections) {
      for (const modelRow of modelSection.rows) {
        if (!modelRow.autoFromRowId) continue;
        const rowId = rowIdByModelRowId.get(modelRow.id);
        const sourceId = rowIdByModelRowId.get(modelRow.autoFromRowId);
        if (!rowId || !sourceId) continue;
        await tx.budgetRow.update({ where: { id: rowId }, data: { autoFromRowId: sourceId, autoPct: modelRow.autoPct } });
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
    kind: section.kind,
    complexity: section.complexity,
    rows: section.rows.map((row) => ({
      id: row.id,
      hourlyRate: Number(row.hourlyRate),
      hours: Number(row.hours),
      qty: Number(row.qty),
      unitPrice: Number(row.unitPrice),
      autoFromRowId: row.autoFromRowId,
      autoPct: row.autoPct !== null ? Number(row.autoPct) : null,
    })),
  });
}

function toBackupSummary(budget: Budget, sections: SectionWithRows[]): BackupSummary {
  // backup.ts filtre par section.id === "fabrication"/"programmation"/"assemblage" —
  // adaptation : passer l'alias attendu comme "id", jamais notre vrai nom de catégorie.
  return backupSummary(
    {
      sections: sections
        .filter((section) => section.category in BACKUP_ELIGIBLE_ALIAS)
        .map((section) => {
          const rows = section.rows.map((row) => ({
            id: row.id,
            hours: Number(row.hours),
            autoFromRowId: row.autoFromRowId,
            autoPct: row.autoPct !== null ? Number(row.autoPct) : null,
          }));
          return { id: BACKUP_ELIGIBLE_ALIAS[section.category as BudgetCategoryValue]!, rows: rows.map((row) => ({ hours: effectiveRowHours(row, rows) })) };
        }),
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

export interface BudgetRowDto {
  id: string;
  label: string;
  hourlyRate: number;
  hours: number; // heures effectives (calculées si auto === true)
  qty: number;
  unitPrice: number;
  directionOnly: boolean;
  auto: boolean; // heures calculées automatiquement à partir d'une autre ligne — non modifiable directement
  risk: string | null;
}

export interface BudgetSectionDto extends SectionSummary {
  id: string;
  kind: BudgetSectionKind;
  rows: BudgetRowDto[];
}

function toRowDto(row: BudgetRow, allRows: BudgetRow[]): BudgetRowDto {
  const plainRows = allRows.map((r) => ({ id: r.id, hours: Number(r.hours), autoFromRowId: r.autoFromRowId, autoPct: r.autoPct !== null ? Number(r.autoPct) : null }));
  const plainRow = plainRows.find((r) => r.id === row.id)!;
  return {
    id: row.id,
    label: row.label,
    hourlyRate: Number(row.hourlyRate),
    hours: effectiveRowHours(plainRow, plainRows),
    qty: Number(row.qty),
    unitPrice: Number(row.unitPrice),
    directionOnly: row.directionOnly,
    auto: row.autoFromRowId !== null,
    risk: row.risk,
  };
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
        kind: section.kind,
        rows: section.rows.map((row) => toRowDto(row, section.rows)),
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

/**
 * Porte d'autorisation PAR LIGNE (pas seulement par route) — une ligne
 * "labor" ou marquée directionOnly exige Direction seulement; une ligne
 * "purchase" non marquée directionOnly accepte aussi le Propriétaire.
 * Vérifié dans le prototype v19 (12 août 2026, éditabilité mélangée à
 * l'intérieur d'une même catégorie pour Installation — Frais divers).
 */
function assertRowEditable(persona: Persona, kind: BudgetSectionKind, directionOnly: boolean): void {
  const requiresDirectionOnly = kind === "labor" || directionOnly;
  const allowed = requiresDirectionOnly ? canModifyBudget(persona) : canModifyBudgetPurchaseLine(persona);
  if (!allowed) throw new HttpError(403, "Vous n'avez pas la permission de modifier cette ligne.");
}

export interface UpdateRowPatch {
  label?: string;
  hours?: number;
  qty?: number;
  unitPrice?: number;
  risk?: string | null;
}

export async function updateRow(persona: Persona, budgetId: string, rowId: string, patch: UpdateRowPatch): Promise<void> {
  await assertBudgetExists(budgetId);
  const row = await prisma.budgetRow.findUnique({ where: { id: rowId }, include: { section: true } });
  if (!row || row.section.budgetId !== budgetId) throw new HttpError(404, "Ligne introuvable pour ce budgétaire.");
  assertRowEditable(persona, row.section.kind, row.directionOnly);
  if (row.autoFromRowId && patch.hours !== undefined) {
    throw new HttpError(400, "Cette ligne est calculée automatiquement — ses heures ne sont pas modifiables directement.");
  }
  // Le nom d'une ligne n'est renommable que dans les sections modulables (lignes
  // vierges au départ, ex. Stock Fabrication) — les tâches fixes (Heures,
  // Consommables, Frais divers) gardent leur nom réel, jamais renommé à la main.
  if (patch.label !== undefined && !(MODULAR_CATEGORIES as readonly string[]).includes(row.section.category)) {
    throw new HttpError(400, "Le nom de cette ligne n'est pas modifiable.");
  }
  await prisma.budgetRow.update({
    where: { id: rowId },
    data: {
      ...(patch.label !== undefined ? { label: patch.label.trim() } : {}),
      ...(patch.hours !== undefined ? { hours: patch.hours } : {}),
      ...(patch.qty !== undefined ? { qty: patch.qty } : {}),
      ...(patch.unitPrice !== undefined ? { unitPrice: patch.unitPrice } : {}),
      ...(patch.risk !== undefined ? { risk: patch.risk?.trim() || null } : {}),
    },
  });
}

export interface AddBudgetRowInput {
  label: string;
  unitPrice?: number;
}

export async function addBudgetRow(persona: Persona, budgetId: string, sectionId: string, input: AddBudgetRowInput): Promise<{ id: string }> {
  await assertBudgetExists(budgetId);
  const section = await assertSectionOfBudget(budgetId, sectionId);
  if (!(MODULAR_CATEGORIES as readonly string[]).includes(section.category)) {
    throw new HttpError(400, "Cette section n'accepte pas de lignes ajoutées manuellement.");
  }
  // Toutes les sections modulables sont de type "purchase", éditables par Direction et Propriétaire.
  if (!canModifyBudgetPurchaseLine(persona)) throw new HttpError(403, "Vous n'avez pas la permission d'ajouter une ligne.");
  const row = await prisma.budgetRow.create({
    data: {
      sectionId,
      modelRowId: null,
      label: input.label.trim(),
      unitPrice: input.unitPrice ?? 0,
      directionOnly: false,
    },
  });
  return { id: row.id };
}

export async function removeBudgetRow(persona: Persona, budgetId: string, rowId: string): Promise<void> {
  await assertBudgetExists(budgetId);
  const row = await prisma.budgetRow.findUnique({ where: { id: rowId }, include: { section: { include: { rows: true } } } });
  if (!row || row.section.budgetId !== budgetId) throw new HttpError(404, "Ligne introuvable pour ce budgétaire.");
  if (!(MODULAR_CATEGORIES as readonly string[]).includes(row.section.category)) {
    throw new HttpError(400, "Cette section n'accepte pas le retrait de lignes.");
  }
  assertRowEditable(persona, row.section.kind, row.directionOnly);
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
  // Obligatoire avant de terminer le budgétaire — vérifié dans le prototype v19 (12 août 2026).
  if (!budget.summary?.trim() || !budget.riskSummary?.trim()) {
    throw new HttpError(400, "Le résumé du budgétaire et le résumé des risques sont obligatoires avant de marquer le budgétaire prêt.");
  }
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
