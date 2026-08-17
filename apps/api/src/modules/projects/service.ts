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
  computeBillingPlan,
  invoiceStatus,
  FULFILLMENT_MODES,
  chooseFulfillment as chooseFulfillmentPure,
  confirmFulfillment as confirmFulfillmentPure,
  projectLifecycleTab,
  type BudgetCategorySlug,
  type FinancialStatus,
  type FulfillmentMode,
  type Persona,
  type ProjectLifecycleTab,
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

    // Cycle de facturation — confirmé le 8-9 août 2026 (billing.ts, jamais
    // modifié) : plan créé une seule fois ici, au prix vendu final gelé.
    // DEFAULT_BILLING_SPLIT seulement pour l'instant — billingSplitOverride
    // (modifier la répartition après coup) reste hors de cette phase.
    const plan = computeBillingPlan(totalSale);
    await tx.invoicePlanEntry.createMany({
      data: plan.map((step) => ({ projectId: project.id, label: step.label, pct: step.pct, amount: step.amount, status: step.status })),
    });

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
  warrantyExpected: boolean;
  warrantyEndsAt: string | null;
  lifecycleTab: ProjectLifecycleTab;
}

/**
 * Carte de la liste Projets (17 août 2026) : mêmes calculs que
 * getProjectDetail (progression, marge réelle, statut financier), mais en
 * lot pour toute la liste plutôt qu'un aller-retour DB par projet — un seul
 * fetch TimeEntry/PurchaseRequest/ProjectPurchaseEntry, regroupé en JS par
 * projectId (même raison qu'ailleurs : le coût réel est un produit
 * heures × costRate par ligne, pas une colonne agrégeable directement en
 * SQL — voir project-actuals.ts).
 *
 * Plus de filtre `closedAt: null` depuis la Phase 2D (Garantie, 17 août
 * 2026) : les 3 onglets (Actifs/Garantie/Fermés) sont dérivés de la liste
 * complète côté interface via `lifecycleTab` (warranty.ts) — jamais un
 * filtre serveur séparé par onglet, pour rester cohérent avec la dérivation
 * "jamais un nouveau statut stocké" confirmée pour la garantie.
 */
export async function listProjects(viewerPersona: Persona): Promise<ProjectListItemDto[]> {
  const showFinancials = canSeeFinancialValues(viewerPersona);
  const projects = await prisma.project.findMany({
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
      warrantyExpected: project.warrantyExpected,
      warrantyEndsAt: project.warrantyEndsAt?.toISOString() ?? null,
      lifecycleTab: projectLifecycleTab(project),
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
  productionCompleted: boolean;
  fulfillmentMode: string | null;
  fulfillmentStatus: string | null;
  fulfillmentAddress: string | null;
  fulfillmentConfirmationNote: string | null;
  billingReady: boolean;
  warrantyExpected: boolean;
  warrantyEndsAt: string | null;
  lifecycleTab: ProjectLifecycleTab;
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
    productionCompleted: project.productionCompleted,
    fulfillmentMode: project.fulfillmentMode,
    fulfillmentStatus: project.fulfillmentStatus,
    fulfillmentAddress: project.fulfillmentAddress,
    fulfillmentConfirmationNote: project.fulfillmentConfirmationNote,
    billingReady: project.billingReady,
    warrantyExpected: project.warrantyExpected,
    warrantyEndsAt: project.warrantyEndsAt?.toISOString() ?? null,
    lifecycleTab: projectLifecycleTab(project),
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

// ---------------------------------------------------------------------------
// Production et sortie — fulfillment.ts (Projet 2C, 17 août 2026). Réutilise
// les fonctions pures telles quelles (jamais réimplémentées, voir CLAUDE.md)
// — cette couche ne fait que lire/écrire Prisma autour d'elles.
// ---------------------------------------------------------------------------

/** fulfillment.ts lance des Error ordinaires (aucune notion HTTP dans business-rules) — reconverties ici en HttpError pour ne pas retomber sur "internal_error" générique côté client. */
function runFulfillmentStep<T>(fn: () => T): T {
  try {
    return fn();
  } catch (err) {
    throw new HttpError(400, err instanceof Error ? err.message : "Erreur de validation.");
  }
}

export async function markProductionComplete(projectId: string): Promise<void> {
  const project = await prisma.project.findUnique({ where: { id: projectId } });
  if (!project) throw new HttpError(404, "Projet introuvable.");
  if (project.productionCompleted) throw new HttpError(400, "La production est déjà marquée complétée.");
  await prisma.project.update({ where: { id: projectId }, data: { productionCompleted: true } });
}

export interface ChooseFulfillmentInput {
  mode: FulfillmentMode;
  driverId?: string | null;
  address?: string;
  scheduled?: string | null;
}

export async function chooseProjectFulfillmentMode(projectId: string, input: ChooseFulfillmentInput): Promise<void> {
  const project = await prisma.project.findUnique({ where: { id: projectId } });
  if (!project) throw new HttpError(404, "Projet introuvable.");
  if (project.fulfillmentMode) throw new HttpError(400, "Le mode de sortie est déjà choisi pour ce projet.");

  const updated = runFulfillmentStep(() =>
    chooseFulfillmentPure(
      {
        productionCompleted: project.productionCompleted,
        fulfillmentMode: (project.fulfillmentMode ?? undefined) as FulfillmentMode | undefined,
        status: project.status,
      },
      input.mode,
      { driverId: input.driverId ?? null, address: input.address ?? "", scheduled: input.scheduled ?? null },
    ),
  );

  await prisma.$transaction(async (tx) => {
    await tx.project.update({
      where: { id: projectId },
      data: {
        fulfillmentMode: updated.fulfillmentMode,
        fulfillmentScheduled: updated.fulfillmentScheduled ? new Date(updated.fulfillmentScheduled) : null,
        fulfillmentDriverId: updated.fulfillmentDriver,
        fulfillmentAddress: updated.fulfillmentAddress,
        fulfillmentStatus: updated.fulfillmentStatus,
      },
    });

    // Mode "Bon de livraison" — crée la livraison assignée au magasinier
    // (fulfillment.ts : "jamais pour warehouse, qui se confirme via le Bon
    // de livraison lui-même" — pas de confirmProjectFulfillment pour ce mode).
    if (input.mode === FULFILLMENT_MODES.WAREHOUSE) {
      const settings = await tx.settings.findFirst();
      if (!settings) throw new HttpError(500, "Paramètres non initialisés — lancer le seed.");
      const displayId = `BL-${new Date().getFullYear()}-${String(settings.nextDeliveryNumber).padStart(4, "0")}`;
      await tx.delivery.create({
        data: {
          displayId,
          type: "project",
          projectId,
          contactId: project.contactId,
          address: input.address || null,
          scheduledAt: input.scheduled ? new Date(input.scheduled) : null,
          driverEmployeeId: input.driverId || null,
          status: "planned",
        },
      });
      await tx.settings.update({ where: { id: settings.id }, data: { nextDeliveryNumber: settings.nextDeliveryNumber + 1 } });
    }
  });
}

/** Confirmer un mode tiers/ramassage — jamais pour warehouse (voir chooseProjectFulfillmentMode). */
export async function confirmProjectFulfillment(projectId: string, note?: string): Promise<void> {
  const project = await prisma.project.findUnique({ where: { id: projectId } });
  if (!project) throw new HttpError(404, "Projet introuvable.");

  const updated = runFulfillmentStep(() =>
    confirmFulfillmentPure(
      {
        fulfillmentMode: (project.fulfillmentMode ?? undefined) as FulfillmentMode | undefined,
        billingReady: project.billingReady,
        fulfillmentStatus: project.fulfillmentStatus ?? undefined,
        status: project.status,
      },
      note ?? "",
    ),
  );

  await prisma.project.update({
    where: { id: projectId },
    data: {
      billingReady: updated.billingReady,
      fulfillmentStatus: updated.fulfillmentStatus,
      fulfillmentConfirmationNote: updated.fulfillmentConfirmationNote,
      status: updated.status,
    },
  });
}

// ---------------------------------------------------------------------------
// Cycle de facturation — billing.ts (Projet 2C, 17 août 2026). Le plan est
// créé une seule fois à la conversion (voir convertBudgetToProject ci-dessus)
// avec DEFAULT_BILLING_SPLIT — modifier la répartition après coup
// (billingSplitOverride, canModifyBillingCycle) reste hors de cette phase.
// Sage reste la source réelle de la facture (billing.ts) : on ne fait
// qu'enregistrer manuellement ce qui a déjà été fait là-bas.
// ---------------------------------------------------------------------------

export interface InvoicePlanEntryDto {
  id: string;
  label: string;
  pct: number;
  amount: number;
  status: "pending" | "sent" | "paid" | "on_hold" | "overdue";
  invoiceNumber: string | null;
  dueDate: string | null;
  paidAmount: number;
  paidAt: string | null;
  isExtra: boolean;
  requestedById: string | null;
  requestedAt: string | null;
  processedById: string | null;
  processedAt: string | null;
}

function toInvoicePlanEntryDto(row: {
  id: string;
  label: string;
  pct: unknown;
  amount: unknown;
  status: string;
  invoiceNumber: string | null;
  dueDate: Date | null;
  paidAmount: unknown;
  paidAt: Date | null;
  isExtra: boolean;
  requestedById: string | null;
  requestedAt: Date | null;
  processedById: string | null;
  processedAt: Date | null;
}): InvoicePlanEntryDto {
  return {
    id: row.id,
    label: row.label,
    pct: Number(row.pct),
    amount: Number(row.amount),
    status: invoiceStatus({
      amount: Number(row.amount),
      paid: Number(row.paidAmount),
      status: row.status,
      due: row.dueDate?.toISOString(),
    }),
    invoiceNumber: row.invoiceNumber,
    dueDate: row.dueDate?.toISOString() ?? null,
    paidAmount: Number(row.paidAmount),
    paidAt: row.paidAt?.toISOString() ?? null,
    isExtra: row.isExtra,
    requestedById: row.requestedById,
    requestedAt: row.requestedAt?.toISOString() ?? null,
    processedById: row.processedById,
    processedAt: row.processedAt?.toISOString() ?? null,
  };
}

export async function getInvoicePlan(projectId: string): Promise<InvoicePlanEntryDto[]> {
  const rows = await prisma.invoicePlanEntry.findMany({ where: { projectId }, orderBy: { createdAt: "asc" } });
  return rows.map(toInvoicePlanEntryDto);
}

/** Fait apparaître la demande dans le centre d'actions d'Administration (Direction seulement, canRequestInvoice). */
export async function requestInvoice(entryId: string, requestedById: string): Promise<InvoicePlanEntryDto> {
  const entry = await prisma.invoicePlanEntry.findUnique({ where: { id: entryId } });
  if (!entry) throw new HttpError(404, "Jalon de facturation introuvable.");
  if (entry.requestedAt) throw new HttpError(400, "La facturation de ce jalon a déjà été demandée.");
  const row = await prisma.invoicePlanEntry.update({ where: { id: entryId }, data: { requestedById, requestedAt: new Date() } });
  return toInvoicePlanEntryDto(row);
}

export interface RecordInvoiceInput {
  invoiceNumber: string;
  dueDate?: string;
}

/** Enregistrer l'entrée de facture — directement, ou en traitant une demande (canCreateInvoiceRecord, jamais un préalable de "demander" d'abord). */
export async function recordInvoice(entryId: string, processedById: string, input: RecordInvoiceInput): Promise<InvoicePlanEntryDto> {
  const entry = await prisma.invoicePlanEntry.findUnique({ where: { id: entryId } });
  if (!entry) throw new HttpError(404, "Jalon de facturation introuvable.");
  const row = await prisma.invoicePlanEntry.update({
    where: { id: entryId },
    data: {
      invoiceNumber: input.invoiceNumber,
      dueDate: input.dueDate ? new Date(input.dueDate) : null,
      status: "sent",
      processedById,
      processedAt: new Date(),
    },
  });
  return toInvoicePlanEntryDto(row);
}

/** Montant payé À CE JOUR (pas un historique de paiements séparé — un seul champ, mis à jour à chaque versement). */
export async function recordInvoicePayment(entryId: string, paidAmount: number): Promise<InvoicePlanEntryDto> {
  const entry = await prisma.invoicePlanEntry.findUnique({ where: { id: entryId } });
  if (!entry) throw new HttpError(404, "Jalon de facturation introuvable.");
  const row = await prisma.invoicePlanEntry.update({ where: { id: entryId }, data: { paidAmount, paidAt: new Date() } });
  return toInvoicePlanEntryDto(row);
}

// ---------------------------------------------------------------------------
// Garantie — warranty.ts (Projet 2D, 17 août 2026). warrantyExpected est une
// simple case informative (pas d'historique — n'active rien seule).
// warrantyEndsAt est le vrai interrupteur, modifiable n'importe quand
// (Direction seulement, canManageWarranty) — chaque changement crée une
// ligne d'historique. Régler une nouvelle fin dans le passé désactive la
// garantie immédiatement (isUnderWarranty compare à "maintenant") — pas de
// bouton "annuler" séparé, le même mécanisme suffit.
// ---------------------------------------------------------------------------

export async function setWarrantyExpected(projectId: string, expected: boolean): Promise<void> {
  const project = await prisma.project.findUnique({ where: { id: projectId } });
  if (!project) throw new HttpError(404, "Projet introuvable.");
  await prisma.project.update({ where: { id: projectId }, data: { warrantyExpected: expected } });
}

export interface WarrantyHistoryEntryDto {
  id: string;
  previousEndsAt: string | null;
  newEndsAt: string;
  reason: string | null;
  invoiceReference: string | null;
  changedById: string;
  changedByName: string;
  changedAt: string;
}

// changedById reste un scalaire simple (pas de relation Prisma), même
// patron que ProjectPurchaseEntry.enteredById/approvedById — nom résolu via
// une recherche groupée séparée plutôt qu'un `include`.
async function warrantyHistoryNamesById(entries: { changedById: string }[]): Promise<Map<string, string>> {
  const ids = [...new Set(entries.map((entry) => entry.changedById))];
  const employees = await prisma.employee.findMany({ where: { id: { in: ids } }, select: { id: true, name: true } });
  return new Map(employees.map((employee) => [employee.id, employee.name]));
}

function toWarrantyHistoryEntryDto(
  row: {
    id: string;
    previousEndsAt: Date | null;
    newEndsAt: Date;
    reason: string | null;
    invoiceReference: string | null;
    changedById: string;
    changedAt: Date;
  },
  nameById: Map<string, string>,
): WarrantyHistoryEntryDto {
  return {
    id: row.id,
    previousEndsAt: row.previousEndsAt?.toISOString() ?? null,
    newEndsAt: row.newEndsAt.toISOString(),
    reason: row.reason,
    invoiceReference: row.invoiceReference,
    changedById: row.changedById,
    changedByName: nameById.get(row.changedById) ?? "—",
    changedAt: row.changedAt.toISOString(),
  };
}

export async function getWarrantyHistory(projectId: string): Promise<WarrantyHistoryEntryDto[]> {
  const rows = await prisma.warrantyHistoryEntry.findMany({ where: { projectId }, orderBy: { changedAt: "desc" } });
  const nameById = await warrantyHistoryNamesById(rows);
  return rows.map((row) => toWarrantyHistoryEntryDto(row, nameById));
}

export interface ActivateWarrantyInput {
  endsAt: string;
  reason?: string;
  invoiceReference?: string;
}

export async function activateOrUpdateWarranty(
  projectId: string,
  input: ActivateWarrantyInput,
  changedById: string,
): Promise<WarrantyHistoryEntryDto> {
  const project = await prisma.project.findUnique({ where: { id: projectId } });
  if (!project) throw new HttpError(404, "Projet introuvable.");

  const [, row] = await prisma.$transaction([
    prisma.project.update({ where: { id: projectId }, data: { warrantyEndsAt: new Date(input.endsAt) } }),
    prisma.warrantyHistoryEntry.create({
      data: {
        projectId,
        previousEndsAt: project.warrantyEndsAt,
        newEndsAt: new Date(input.endsAt),
        reason: input.reason || null,
        invoiceReference: input.invoiceReference || null,
        changedById,
      },
    }),
  ]);
  const nameById = await warrantyHistoryNamesById([row]);
  return toWarrantyHistoryEntryDto(row, nameById);
}
