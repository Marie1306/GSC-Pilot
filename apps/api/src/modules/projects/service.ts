/**
 * Projets — Phase 1 : conversion d'un budgétaire « Contrat obtenu » en
 * projet réel, et écran de détail « coup d'œil » seulement (les totaux
 * globaux). La table de comparaison planifié/réel par catégorie, le Gantt,
 * les sous-assemblages, le suivi des achats/heures réels et la facturation
 * restent hors de cette phase — voir la spécification confirmée, section
 * « Conversion Budgétaire → Projet — préparation » (12 août 2026) : leur
 * détail exact reste à vérifier avec l'utilisatrice avant de les construire.
 *
 * Répartition confirmée le 12 août 2026 : `plannedHours`/`plannedPurchases`
 * viennent des catégories du budgétaire selon leur `kind` (labor vs
 * purchase) — jamais des back-up, qui ont leurs propres champs séparés
 * (`backupHours`/`backupHoursCost`, `projectBackupAmount`). `laborHours`/
 * `laborCost` démarrent égaux à `plannedHours`/coût de main-d'œuvre à la
 * conversion, puis grossissent seuls avec chaque avenant (`amendments.ts`,
 * jamais modifié) — `plannedHours`/`actualHours` restent la référence figée
 * pour la comparaison, jamais touchés par un avenant.
 */
import {
  projectMargin,
  financialStatus,
  actualHoursByCategory,
  canSeeFinancialValues,
  BUDGET_CATEGORY_GROUP,
  BUDGET_CATEGORY_LABELS,
  type BudgetCategorySlug,
  type FinancialStatus,
  type Persona,
} from "@gsc-pilot/business-rules";
import { prisma } from "../../db.js";
import { HttpError } from "../../middleware/errorHandler.js";
import { getBudgetDetail } from "../budgets/service.js";
import { projectPurchasesActual } from "../purchases/service.js";
import type { Project } from "../../generated/prisma/client.js";

export interface ConvertBudgetToProjectInput {
  name: string;
  /**
   * Optionnel — reprendre un numéro hérité de l'ancien système (ex. 2267).
   * Nombre brut, jamais de préfixe ni de zéros devant (confirmé le 17 août
   * 2026, contrairement à BG-AAAA-NNNN etc.). Absent = numéro automatique
   * (settings.nextProjectNumber). Dans les deux cas, le compteur est mis à
   * jour au MAXIMUM utilisé — jamais simplement incrémenté à l'aveugle —
   * pour que l'automatique reprenne correctement après un numéro manuel.
   */
  projectNumber?: string;
}

/** Numéro suggéré pour préremplir le champ du formulaire — jamais deviné côté interface. */
export async function getNextProjectNumber(): Promise<number> {
  const settings = await prisma.settings.findFirst();
  if (!settings) throw new HttpError(500, "Paramètres non initialisés — lancer le seed.");
  return settings.nextProjectNumber;
}

export async function convertBudgetToProject(createdById: string, budgetId: string, input: ConvertBudgetToProjectInput): Promise<Project> {
  const name = input.name?.trim();
  if (!name) throw new HttpError(400, "Le nom du projet est requis.");

  const requestedNumber = input.projectNumber?.trim();
  if (requestedNumber !== undefined && requestedNumber !== "" && !/^\d+$/.test(requestedNumber)) {
    throw new HttpError(400, "Le numéro de projet doit être composé uniquement de chiffres.");
  }
  if (requestedNumber) {
    const taken = await prisma.project.findUnique({ where: { projectNumber: requestedNumber } });
    if (taken) throw new HttpError(409, `Le numéro ${requestedNumber} est déjà utilisé par un autre projet.`);
  }

  const budget = await prisma.budget.findUnique({ where: { id: budgetId } });
  if (!budget) throw new HttpError(404, "Budgétaire introuvable.");
  if (budget.status !== "won") throw new HttpError(400, "Seul un budgétaire au statut « Contrat obtenu » peut être converti en projet.");

  const existing = await prisma.project.findUnique({ where: { budgetId } });
  if (existing) throw new HttpError(400, "Ce budgétaire a déjà été converti en projet.");

  if (!budget.clientRequestId) {
    throw new HttpError(500, "Ce budgétaire n'a pas de demande client associée — impossible de déterminer le contact du projet.");
  }
  const clientRequest = await prisma.clientRequest.findUnique({ where: { id: budget.clientRequestId }, select: { contactId: true } });
  if (!clientRequest) throw new HttpError(500, "Demande client introuvable pour ce budgétaire.");

  const detail = await getBudgetDetail(budgetId);

  const laborSections = detail.sections.filter((section) => section.kind === "labor");
  const purchaseSections = detail.sections.filter((section) => section.kind === "purchase");
  const plannedHours = laborSections.reduce((sum, section) => sum + section.hours, 0);
  const laborCost = laborSections.reduce((sum, section) => sum + section.baseCost, 0);
  const plannedPurchases = purchaseSections.reduce((sum, section) => sum + section.baseCost, 0);

  // "Installation planifiée" (grille de la vue projet) : heures + achats +
  // frais divers des 3 catégories du groupe "installation", avant marge —
  // gelé ici même esprit que plannedHours/plannedPurchases ci-dessus.
  const installationSections = detail.sections.filter(
    (section) => BUDGET_CATEGORY_GROUP[section.category as BudgetCategorySlug] === "installation",
  );
  const installationPlannedHours = installationSections.reduce((sum, section) => sum + section.hours, 0);
  const installationPlannedCost = installationSections.reduce((sum, section) => sum + section.baseCost, 0);

  const totalSale = detail.totals.totalSale;
  const totalBaseCost = detail.totals.totalBaseCost;
  const targetMarginPct = totalSale > 0 ? Math.round(((totalSale - totalBaseCost) / totalSale) * 100 * 100) / 100 : 0;

  return prisma.$transaction(async (tx) => {
    const settings = await tx.settings.findFirst();
    if (!settings) throw new HttpError(500, "Paramètres non initialisés — lancer le seed.");
    const projectNumber = requestedNumber || String(settings.nextProjectNumber);
    const nextAfter = Math.max(settings.nextProjectNumber, Number(projectNumber) + 1);

    const project = await tx.project.create({
      data: {
        projectNumber,
        name,
        contactId: clientRequest.contactId,
        clientRequestId: budget.clientRequestId,
        budgetId: budget.id,
        status: "active",
        sold: totalSale,
        plannedPurchases,
        plannedHours,
        laborHours: plannedHours,
        laborCost,
        backupHours: detail.backup.hours,
        backupHoursCost: detail.backup.baseCost,
        backupHourlyRate: detail.backupHourlyRate,
        projectBackupAmount: detail.projectBackup.baseCost,
        installationPlannedHours,
        installationPlannedCost,
        targetMarginPct,
        createdById,
      },
    });

    await tx.settings.update({ where: { id: settings.id }, data: { nextProjectNumber: nextAfter } });

    return project;
  });
}

export interface ProjectListItemDto {
  id: string;
  projectNumber: string;
  name: string;
  status: string;
  contactName: string;
  company: string | null;
  deadline: string | null;
  sold?: number;
  hoursUsedPct: number;
  progressionPct?: number;
  grossMarginPct?: number;
  financialStatus?: FinancialStatus;
}

/**
 * Carte de la liste Projets (17 août 2026) : mêmes calculs que
 * getProjectDetail (progression, marge réelle, statut financier), mais en
 * lot pour toute la liste plutôt qu'un aller-retour DB par projet — un seul
 * fetch TimeEntry/PurchaseRequest/ProjectPurchaseEntry, regroupé en JS par
 * projectId (même raison qu'ailleurs : le coût réel est un produit
 * heures × costRate par ligne, pas une colonne agrégeable directement en
 * SQL — voir project-actuals.ts).
 */
export async function listProjects(viewerPersona: Persona): Promise<ProjectListItemDto[]> {
  const showFinancials = canSeeFinancialValues(viewerPersona);
  const projects = await prisma.project.findMany({
    where: { closedAt: null },
    include: { contact: { select: { name: true, company: true } } },
    orderBy: { projectNumber: "asc" },
  });
  const ids = projects.map((project) => project.id);

  const [timeEntries, appliedRequests, approvedEntries, settings] = await Promise.all([
    prisma.timeEntry.findMany({
      where: { projectId: { in: ids }, status: "approved" },
      select: { projectId: true, category: true, status: true, roundedMinutes: true, costRate: true },
    }),
    prisma.purchaseRequest.findMany({
      where: { projectId: { in: ids }, appliedToProjectAt: { not: null } },
      select: { projectId: true, amount: true },
    }),
    prisma.projectPurchaseEntry.findMany({
      where: { projectId: { in: ids }, status: "approved" },
      select: { projectId: true, amount: true },
    }),
    prisma.settings.findFirst(),
  ]);
  if (!settings) throw new HttpError(500, "Paramètres non initialisés — lancer le seed.");

  const timeEntriesByProject = new Map<string, typeof timeEntries>();
  for (const entry of timeEntries) {
    if (!entry.projectId) continue;
    const list = timeEntriesByProject.get(entry.projectId) ?? [];
    list.push(entry);
    timeEntriesByProject.set(entry.projectId, list);
  }
  const purchasesByProject = new Map<string, number>();
  for (const request of appliedRequests) {
    if (!request.projectId) continue;
    purchasesByProject.set(request.projectId, round2((purchasesByProject.get(request.projectId) ?? 0) + Number(request.amount ?? 0)));
  }
  for (const entry of approvedEntries) {
    purchasesByProject.set(entry.projectId, round2((purchasesByProject.get(entry.projectId) ?? 0) + Number(entry.amount)));
  }

  const thresholds = {
    conformeThreshold: Number(settings.marginConformeThreshold),
    atRiskThreshold: Number(settings.marginAtRiskThreshold),
  };

  return projects.map((project) => {
    const actualByCategory = actualHoursByCategory(
      (timeEntriesByProject.get(project.id) ?? []).map((entry) => ({
        category: entry.category,
        status: entry.status,
        roundedMinutes: entry.roundedMinutes,
        costRate: Number(entry.costRate),
      })),
    );
    const actualHours = round2(actualByCategory.reduce((sum, row) => sum + row.hours, 0));
    const actualLaborCost = round2(actualByCategory.reduce((sum, row) => sum + row.cost, 0));
    const purchasesActual = purchasesByProject.get(project.id) ?? 0;
    const sold = Number(project.sold);
    const plannedHours = Number(project.plannedHours);
    const grossMarginPct = round2(projectMargin(sold, actualLaborCost, purchasesActual).grossMarginPct);
    const backupRate = project.backupHourlyRate !== null ? Number(project.backupHourlyRate) : 0;
    const plannedBase = plannedHours * backupRate + Number(project.plannedPurchases);
    const actualBase = actualHours * backupRate + purchasesActual;

    return {
      id: project.id,
      projectNumber: project.projectNumber,
      name: project.name,
      status: project.status,
      contactName: project.contact.name,
      company: project.contact.company,
      deadline: project.deadline?.toISOString() ?? null,
      hoursUsedPct: plannedHours > 0 ? round2((actualHours / plannedHours) * 100) : 0,
      ...(showFinancials && {
        sold,
        progressionPct: plannedBase > 0 ? round2((actualBase / plannedBase) * 100) : 0,
        grossMarginPct,
        financialStatus: financialStatus(grossMarginPct, thresholds),
      }),
    };
  });
}

export interface ProjectComparatifRow {
  category: string;
  categoryLabel: string;
  plannedHours: number;
  actualHours: number;
  hoursDelta: number;
  plannedCost?: number;
  actualCost?: number;
  costDelta?: number;
}

export interface ProjectDetailDto {
  id: string;
  projectNumber: string;
  name: string;
  status: string;
  contactName: string;
  company: string | null;
  budgetId: string | null;
  budgetDisplayId: string | null;
  createdAt: string;
  sold?: number;
  plannedHours: number;
  actualHours: number;
  hoursUsedPct: number;
  plannedPurchases?: number;
  actualPurchases?: number;
  installationPlannedHours: number;
  installationPlannedCost?: number;
  backupHours: number;
  backupHoursCost?: number;
  projectBackupAmount?: number;
  grossMargin?: number;
  grossMarginPct?: number;
  targetMarginPct?: number | null;
  financialStatus?: FinancialStatus;
  progressionPct?: number;
  comparatif: ProjectComparatifRow[];
}

/**
 * Vue enrichie de la Phase 2A (17 août 2026) : bandeau de statut financier,
 * grille complète, Progression du projet, Comparatif planifié vs réel.
 * actualHours/actualPurchases ne sont jamais lus depuis les colonnes
 * Project.actualHours/actualPurchases (restées à 0 depuis la Phase 1,
 * TimeEntry/ProjectPurchaseEntry n'y étaient pas branchés) — toujours
 * recalculés ici à la lecture, même esprit que projectPurchasesActual
 * (purchases/service.ts) : jamais un total dupliqué/périmé.
 *
 * showFinancials (canSeeFinancialValues, roles.ts) : Employé et Magasinier
 * ne voient jamais de $ ni de marge — principe transversal confirmé le 7
 * août 2026, vérifié ici comme dans chaque autre vue. Progression % est
 * gelée sous ce même interrupteur : son calcul convertit des heures en $
 * (voir plus bas), donc la valeur elle-même reste financière même affichée
 * en pourcentage.
 */
export async function getProjectDetail(id: string, viewerPersona: Persona): Promise<ProjectDetailDto> {
  const project = await prisma.project.findUnique({
    where: { id },
    include: { contact: { select: { name: true, company: true } }, budget: { select: { displayId: true } } },
  });
  if (!project) throw new HttpError(404, "Projet introuvable.");

  const showFinancials = canSeeFinancialValues(viewerPersona);

  const [timeEntries, purchasesActual, settings] = await Promise.all([
    prisma.timeEntry.findMany({
      where: { projectId: id, status: "approved" },
      select: { category: true, status: true, roundedMinutes: true, costRate: true },
    }),
    projectPurchasesActual(id),
    prisma.settings.findFirst(),
  ]);
  if (!settings) throw new HttpError(500, "Paramètres non initialisés — lancer le seed.");

  const actualByCategory = actualHoursByCategory(
    timeEntries.map((entry) => ({
      category: entry.category,
      status: entry.status,
      roundedMinutes: entry.roundedMinutes,
      costRate: Number(entry.costRate),
    })),
  );
  const actualHours = round2(actualByCategory.reduce((sum, row) => sum + row.hours, 0));
  const actualLaborCost = round2(actualByCategory.reduce((sum, row) => sum + row.cost, 0));

  const sold = Number(project.sold);
  const plannedHours = Number(project.plannedHours);
  const marginResult = projectMargin(sold, actualLaborCost, purchasesActual);
  const grossMargin = marginResult.grossMargin;
  const grossMarginPct = round2(marginResult.grossMarginPct);
  const status = financialStatus(grossMarginPct, {
    conformeThreshold: Number(settings.marginConformeThreshold),
    atRiskThreshold: Number(settings.marginAtRiskThreshold),
  });

  // Progression du projet — confirmé le 17 août 2026 : tout converti en $
  // avec Project.backupHourlyRate (taux gelé du budgétaire d'origine, PAS
  // le coût réel par employé ni le taux de chaque ligne budgétaire — ceux-là
  // servent à la marge réelle ci-dessus, un calcul volontairement distinct).
  // Achats = mêmes achats réels/planifiés que les tuiles (appliquées au
  // projet, jamais simplement "authorized").
  const backupRate = project.backupHourlyRate !== null ? Number(project.backupHourlyRate) : 0;
  const plannedPurchases = Number(project.plannedPurchases);
  const plannedBase = plannedHours * backupRate + plannedPurchases;
  const actualBase = actualHours * backupRate + purchasesActual;
  const progressionPct = plannedBase > 0 ? round2((actualBase / plannedBase) * 100) : 0;

  // Comparatif planifié vs réel — regroupé par CATÉGORIE seulement (pas par
  // sous-tâche : TimeEntry.taskId/PunchableTask existent au schéma mais ne
  // sont peuplés nulle part, voir project-actuals.ts). Vide si le projet
  // n'a pas de budgétaire d'origine (création directe).
  let comparatif: ProjectComparatifRow[] = [];
  if (project.budgetId) {
    const budgetDetail = await getBudgetDetail(project.budgetId);
    const actualByCategoryMap = new Map(actualByCategory.map((row) => [row.category, row]));
    comparatif = budgetDetail.sections
      .filter((section) => section.kind === "labor")
      .map((section) => {
        const actual = actualByCategoryMap.get(section.category);
        const rowActualHours = actual?.hours ?? 0;
        const rowActualCost = round2(actual?.cost ?? 0);
        return {
          category: section.category,
          categoryLabel: BUDGET_CATEGORY_LABELS[section.category as BudgetCategorySlug] ?? section.category,
          plannedHours: section.hours,
          actualHours: rowActualHours,
          hoursDelta: round2(rowActualHours - section.hours),
          ...(showFinancials && {
            plannedCost: section.baseCost,
            actualCost: rowActualCost,
            costDelta: round2(rowActualCost - section.baseCost),
          }),
        };
      });
  }

  return {
    id: project.id,
    projectNumber: project.projectNumber,
    name: project.name,
    status: project.status,
    contactName: project.contact.name,
    company: project.contact.company,
    budgetId: project.budgetId,
    budgetDisplayId: project.budget?.displayId ?? null,
    createdAt: project.createdAt.toISOString(),
    plannedHours,
    actualHours,
    hoursUsedPct: plannedHours > 0 ? round2((actualHours / plannedHours) * 100) : 0,
    installationPlannedHours: Number(project.installationPlannedHours),
    backupHours: Number(project.backupHours),
    comparatif,
    ...(showFinancials && {
      sold,
      plannedPurchases,
      actualPurchases: purchasesActual,
      installationPlannedCost: Number(project.installationPlannedCost),
      backupHoursCost: Number(project.backupHoursCost),
      projectBackupAmount: Number(project.projectBackupAmount),
      grossMargin,
      grossMarginPct,
      targetMarginPct: project.targetMarginPct !== null ? Number(project.targetMarginPct) : null,
      financialStatus: status,
      progressionPct,
    }),
  };
}

function round2(value: number): number {
  return Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100;
}
