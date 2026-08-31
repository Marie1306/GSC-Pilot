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
  BACKUP_ELIGIBLE_ALIAS,
  sectionSummary,
  computeBillingPlan,
  invoiceStatus,
  type BillingSplitStep,
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
import { ensureContactRow } from "../clientRequests/service.js";
import { projectPurchasesActual, listProjectPurchaseEntries } from "../purchases/service.js";
import { parseBillingSplit } from "../settings/billingSplit.js";
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
    // Répartition = Settings.defaultBillingSplit (Paramètres, 20 août 2026),
    // jamais un DEFAULT_BILLING_SPLIT codé en dur — billingSplitOverride
    // (modifier la répartition après coup, par projet) reste hors de cette
    // phase.
    const plan = computeBillingPlan(totalSale, parseBillingSplit(settings.defaultBillingSplit));
    await tx.invoicePlanEntry.createMany({
      data: plan.map((step, index) => ({ projectId: project.id, label: step.label, pct: step.pct, amount: step.amount, status: step.status, sortOrder: index })),
    });

    return project;
  });
}

export interface NewProjectContactInput {
  contactName: string;
  company?: string;
  contactRole?: string;
  phone?: string;
  email?: string;
}

export interface CreateProjectDirectInput {
  name: string;
  /** Même règle que ConvertBudgetToProjectInput.projectNumber ci-dessus. */
  projectNumber?: string;
  newContact: NewProjectContactInput;
  /** Conversion directe depuis une demande client (31 août 2026) — voir la validation dans createProjectDirect. */
  clientRequestId?: string;
}

/**
 * Conversion directe d'une demande client en projet (31 août 2026, demande
 * explicite de l'utilisatrice) — même mécanique que Budget/ServiceCall/
 * Rolling↔ClientRequest : validée AVANT la transaction, puis
 * ClientRequest.status posé à "converted" DANS la même transaction que la
 * création du projet. Contrairement à budgetId/serviceCallId (colonnes
 * directes sur ClientRequest), la relation gérée vit sur
 * Project.clientRequestId (@unique) — voir schema.prisma.
 */
async function assertClientRequestConvertibleToProject(clientRequestId: string): Promise<void> {
  const request = await prisma.clientRequest.findUnique({ where: { id: clientRequestId }, select: { id: true } });
  if (!request) throw new HttpError(404, "Demande client introuvable.");
  const existing = await prisma.project.findUnique({ where: { clientRequestId }, select: { id: true } });
  if (existing) throw new HttpError(400, "Cette demande a déjà un projet.");
}

/**
 * Création directe, hors conversion d'un budgétaire (spécification confirmée,
 * section « Projets — création directe », 9 août 2026) : Direction et
 * Propriétaire seulement (canCreateProjectDirectly, déjà en place côté
 * routes). Contact résolu via ensureContactRow — même mécanisme de
 * déduplication/catégorisation ("Projet") que les demandes clients/
 * budgétaires/appels de service, confirmé branché ici aussi par la
 * spécification.
 *
 * Aucun budgétaire à l'origine : tous les champs $ (sold, plannedHours,
 * targetMarginPct, etc.) restent à leur valeur par défaut du schéma —
 * voir le commentaire sur Project.targetMarginPct ("absente pour un projet
 * créé directement"). Pas de plan de facturation généré ici non plus,
 * contrairement à convertBudgetToProject : rien de réel à répartir tant
 * qu'aucun prix vendu n'est connu — l'édition de ces champs sur un projet
 * direct reste hors de cette passe (pas d'écran « méta » pour le Projet,
 * contrairement au Budgétaire).
 */
export async function createProjectDirect(createdById: string, input: CreateProjectDirectInput): Promise<Project> {
  const name = input.name?.trim();
  if (!name) throw new HttpError(400, "Le nom du projet est requis.");
  if (!input.newContact?.contactName?.trim()) throw new HttpError(400, "Le nom du contact est requis.");
  if (input.clientRequestId) await assertClientRequestConvertibleToProject(input.clientRequestId);

  const requestedNumber = input.projectNumber?.trim();
  if (requestedNumber !== undefined && requestedNumber !== "" && !/^\d+$/.test(requestedNumber)) {
    throw new HttpError(400, "Le numéro de projet doit être composé uniquement de chiffres.");
  }
  if (requestedNumber) {
    const taken = await prisma.project.findUnique({ where: { projectNumber: requestedNumber } });
    if (taken) throw new HttpError(409, `Le numéro ${requestedNumber} est déjà utilisé par un autre projet.`);
  }

  // Résolu AVANT la transaction, même principe que createBudget/createServiceCall.
  const contact = await ensureContactRow({ ...input.newContact, requestType: "project" });

  return prisma.$transaction(async (tx) => {
    const settings = await tx.settings.findFirst();
    if (!settings) throw new HttpError(500, "Paramètres non initialisés — lancer le seed.");
    const projectNumber = requestedNumber || String(settings.nextProjectNumber);
    const nextAfter = Math.max(settings.nextProjectNumber, Number(projectNumber) + 1);

    const project = await tx.project.create({
      data: {
        projectNumber,
        name,
        contactId: contact.id,
        clientRequestId: input.clientRequestId ?? null,
        status: "active",
        createdById,
      },
    });

    await tx.settings.update({ where: { id: settings.id }, data: { nextProjectNumber: nextAfter } });

    if (input.clientRequestId) {
      await tx.clientRequest.update({ where: { id: input.clientRequestId }, data: { status: "converted" } });
    }

    return project;
  });
}

export interface UpdateProjectPlanningInput {
  sold?: number;
  plannedHours?: number;
  plannedPurchases?: number;
  installationPlannedHours?: number;
  installationPlannedCost?: number;
}

/**
 * Remplir après coup les champs qu'un budgétaire aurait normalement fournis
 * — demandé le 19 août 2026 : certaines soumissions se vendent seulement
 * avec un montant global, sans détail d'heures par catégorie (compétition
 * féroce, plusieurs soumissions envoyées en même temps). Chaque champ est
 * indépendant, jamais dérivé d'un autre — remplir plannedHours ne
 * recalcule jamais sold, et vice-versa (confirmé explicitement).
 *
 * Réservé aux projets SANS budgétaire d'origine (budgetId null) : sur un
 * projet converti, ces mêmes champs sont gelés depuis la conversion — même
 * principe que backupHourlyRate/targetMarginPct ailleurs dans ce fichier,
 * jamais réécrits après coup.
 *
 * targetMarginPct reste volontairement absent d'ici : le schéma documente
 * déjà qu'il doit rester nul pour un projet créé directement.
 *
 * Plan de facturation : généré une seule fois, la première fois que sold
 * devient > 0 sur un projet qui n'a encore aucune entrée de plan — même
 * mécanisme (computeBillingPlan) que convertBudgetToProject, jamais
 * réimplémenté. Un sold déjà facturé n'est plus jamais retouché ici, mais
 * reste modifiable (compteurs internes) — seul le plan déjà généré reste
 * gelé, cohérent avec le principe déjà établi ailleurs dans ce module.
 */
export async function updateProjectPlanning(projectId: string, input: UpdateProjectPlanningInput): Promise<void> {
  const project = await prisma.project.findUnique({ where: { id: projectId } });
  if (!project) throw new HttpError(404, "Projet introuvable.");
  if (project.budgetId) {
    throw new HttpError(400, "Ce projet a un budgétaire d'origine — ces champs sont gelés depuis la conversion.");
  }

  await prisma.$transaction(async (tx) => {
    await tx.project.update({
      where: { id: projectId },
      data: {
        ...(input.sold !== undefined && { sold: input.sold }),
        ...(input.plannedHours !== undefined && { plannedHours: input.plannedHours }),
        ...(input.plannedPurchases !== undefined && { plannedPurchases: input.plannedPurchases }),
        ...(input.installationPlannedHours !== undefined && { installationPlannedHours: input.installationPlannedHours }),
        ...(input.installationPlannedCost !== undefined && { installationPlannedCost: input.installationPlannedCost }),
      },
    });

    if (input.sold !== undefined && input.sold > 0) {
      const existingPlan = await tx.invoicePlanEntry.count({ where: { projectId } });
      if (existingPlan === 0) {
        const settings = await tx.settings.findFirst();
        if (!settings) throw new HttpError(500, "Paramètres non initialisés — lancer le seed.");
        const plan = computeBillingPlan(input.sold, parseBillingSplit(settings.defaultBillingSplit));
        await tx.invoicePlanEntry.createMany({
          data: plan.map((step, index) => ({ projectId, label: step.label, pct: step.pct, amount: step.amount, status: step.status, sortOrder: index })),
        });
      }
    }
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
  actualHours: number;
  cost?: number;
  grossMargin?: number;
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
    where: { archivedAt: null, deletedAt: null },
    include: { contact: { select: { name: true, company: true } } },
    orderBy: { projectNumber: "asc" },
  });
  const ids = projects.map((project) => project.id);

  const budgetIds = projects.map((project) => project.budgetId).filter((id): id is string => id !== null);

  const [timeEntries, appliedRequests, approvedEntries, settings, laborSections, budgetsById] = await Promise.all([
    prisma.timeEntry.findMany({
      where: { projectId: { in: ids }, status: "approved", deletedAt: null },
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
    // "Valeur des heures" (voir computeHoursValueBase) : un seul fetch batché
    // des sections labor de tous les budgétaires de la liste, jamais un
    // aller-retour getBudgetDetail par projet (même raison que
    // timeEntries/achats ci-dessus — voir le commentaire de fonction).
    budgetIds.length > 0
      ? prisma.budgetSection.findMany({ where: { budgetId: { in: budgetIds }, kind: "labor" }, include: { rows: true } })
      : Promise.resolve([]),
    budgetIds.length > 0
      ? prisma.budget.findMany({ where: { id: { in: budgetIds } }, select: { id: true, backupHoursPct: true } })
      : Promise.resolve([]),
  ]);
  if (!settings) throw new HttpError(500, "Paramètres non initialisés — lancer le seed.");

  const laborSectionsByBudget = new Map<string, typeof laborSections>();
  for (const section of laborSections) {
    const list = laborSectionsByBudget.get(section.budgetId) ?? [];
    list.push(section);
    laborSectionsByBudget.set(section.budgetId, list);
  }
  const backupPctByBudget = new Map(budgetsById.map((budget) => [budget.id, Number(budget.backupHoursPct)]));

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
    if (!entry.projectId) continue;
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
    const marginResult = projectMargin(sold, actualLaborCost, purchasesActual);
    const grossMarginPct = round2(marginResult.grossMarginPct);

    // Progression — même correction que getProjectDetail (computeHoursValueBase) :
    // chaque catégorie à son propre taux de ligne, jamais le taux de back-up
    // appliqué à toutes les heures. Repli sur l'ancien calcul global
    // seulement si le projet n'a pas de budgétaire (aucune ligne pour
    // connaître un taux propre).
    const backupRate = project.backupHourlyRate !== null ? Number(project.backupHourlyRate) : 0;
    let plannedBase: number;
    let actualBase: number;
    if (project.budgetId) {
      const actualByCategoryMap = new Map(actualByCategory.map((row) => [row.category, row]));
      const sections = (laborSectionsByBudget.get(project.budgetId) ?? []).map((section) =>
        sectionSummary({
          category: section.category,
          kind: "labor",
          rows: section.rows.map((row) => ({
            id: row.id,
            hours: Number(row.hours),
            hourlyRate: Number(row.hourlyRate),
            autoFromRowId: row.autoFromRowId,
            autoPct: row.autoPct !== null ? Number(row.autoPct) : null,
          })),
        }),
      );
      const backupPct = backupPctByBudget.get(project.budgetId) ?? 0;
      const { plannedHoursValue, actualHoursValue, actualBackupCost } = computeHoursValueBase(sections, actualByCategoryMap, backupPct, backupRate);
      plannedBase = round2(plannedHoursValue + Number(project.backupHoursCost) + Number(project.plannedPurchases));
      actualBase = round2(actualHoursValue + actualBackupCost + purchasesActual);
    } else {
      plannedBase = plannedHours * backupRate + Number(project.plannedPurchases);
      actualBase = actualHours * backupRate + purchasesActual;
    }

    return {
      id: project.id,
      projectNumber: project.projectNumber,
      name: project.name,
      status: project.status,
      contactName: project.contact.name,
      company: project.contact.company,
      deadline: project.deadline?.toISOString() ?? null,
      hoursUsedPct: plannedHours > 0 ? round2((actualHours / plannedHours) * 100) : 0,
      actualHours,
      warrantyExpected: project.warrantyExpected,
      warrantyEndsAt: project.warrantyEndsAt?.toISOString() ?? null,
      lifecycleTab: projectLifecycleTab(project),
      ...(showFinancials && {
        sold,
        cost: round2(actualLaborCost + purchasesActual),
        grossMargin: marginResult.grossMargin,
        progressionPct: plannedBase > 0 ? round2((actualBase / plannedBase) * 100) : 0,
        grossMarginPct,
        financialStatus: financialStatus(grossMarginPct, thresholds),
      }),
    };
  });
}

/** Détail par tâche à l'intérieur d'une catégorie — voir computeProjectFinancials pour la jointure (PunchableTask.budgetModelRowId === BudgetRow.modelRowId). */
export interface ProjectComparatifTaskRow {
  taskId: string;
  taskLabel: string;
  plannedHours: number;
  actualHours: number;
  hoursDelta: number;
  plannedCost?: number;
  actualCost?: number;
  costDelta?: number;
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
  /** Absent pour un projet sans budgétaire d'origine (rien à détailler par tâche). */
  tasks?: ProjectComparatifTaskRow[];
}

export interface ProjectDetailDto {
  id: string;
  projectNumber: string;
  name: string;
  status: string;
  contactId: string;
  contactName: string;
  company: string | null;
  contactRole: string | null;
  contactPhone: string | null;
  contactEmail: string | null;
  budgetId: string | null;
  budgetDisplayId: string | null;
  clientRequestId: string | null;
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
  /** Taux gelé du budgétaire d'origine — exposé pour le calcul en direct de l'avenant côté client (calculateAmendment, jamais réimplémenté). */
  backupHourlyRate?: number | null;
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
  deadline: string | null;
  archivedAt: string | null;
  deletedAt: string | null;
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
interface ProjectFinancials {
  actualHours: number;
  actualLaborCost: number;
  purchasesActual: number;
  grossMargin: number;
  grossMarginPct: number;
  status: FinancialStatus;
  comparatif: ProjectComparatifRow[];
  /** Voir computeHoursValueBase — 0/0/0 si le projet n'a pas de budgétaire d'origine (aucun taux par catégorie disponible, voir getProjectDetail pour le repli). */
  plannedHoursValue: number;
  actualHoursValue: number;
  actualBackupCost: number;
}

/**
 * « Valeur des heures » (planifiées et réelles) pour la Progression du
 * projet — CHAQUE catégorie valorisée à SON PROPRE taux de ligne
 * budgétaire, jamais un taux unique appliqué à tout (bug confirmé le 28
 * août 2026 par l'utilisatrice, avec exemple chiffré : conception à 117$,
 * plasma à 116$, peinture à 107$, assemblage à 112$ — jamais le taux de
 * back-up appliqué uniformément, qui ne revient qu'aux heures de back-up
 * elles-mêmes). Distinct du coût réel de main-d'oeuvre (actualLaborCost,
 * ci-dessus, au taux de COÛT de l'employé qui a punché — sert la marge
 * réelle, un calcul volontairement différent que l'utilisatrice a confirmé
 * correct et à ne pas toucher).
 *
 * Taux "réel" par catégorie = le même taux moyen que le planifié de cette
 * catégorie (section.baseCost / section.hours) — jamais le coût employé.
 * Back-up réel = heures réelles des catégories éligibles (voir
 * BACKUP_ELIGIBLE_ALIAS, categories.ts — section.category est le slug Prisma
 * réel, ex. "panelProgramming"/"assemblyTest", PAS les noms alias utilisés
 * par ELIGIBLE_BACKUP_CATEGORIES dans backup.ts, ex. "programmation"/
 * "assemblage" — comparer contre ce dernier ne matcherait jamais ces deux
 * catégories) × le VRAI pourcentage de CE budgétaire (budget.backupHoursPct,
 * jamais un 10% deviné) × le taux de back-up gelé du projet.
 */
export function computeHoursValueBase(
  laborSectionSummaries: { category: string; hours: number; baseCost: number }[],
  actualByCategoryMap: Map<string, { hours: number }>,
  backupPct: number,
  backupHourlyRate: number,
): { plannedHoursValue: number; actualHoursValue: number; actualBackupCost: number } {
  let plannedHoursValue = 0;
  let actualHoursValue = 0;
  let actualEligibleHours = 0;
  for (const section of laborSectionSummaries) {
    plannedHoursValue += section.baseCost;
    const actualHoursInCategory = actualByCategoryMap.get(section.category)?.hours ?? 0;
    const rate = section.hours > 0 ? section.baseCost / section.hours : 0;
    actualHoursValue += round2(actualHoursInCategory * rate);
    if (section.category in BACKUP_ELIGIBLE_ALIAS) {
      actualEligibleHours += actualHoursInCategory;
    }
  }
  const actualBackupHours = round2((actualEligibleHours * backupPct) / 100);
  const actualBackupCost = round2(actualBackupHours * backupHourlyRate);
  return { plannedHoursValue: round2(plannedHoursValue), actualHoursValue: round2(actualHoursValue), actualBackupCost };
}

/**
 * Calcul financier partagé entre getProjectDetail et getPostMortem (Projet
 * 2E, 17 août 2026) — les deux affichent exactement les mêmes chiffres
 * (comparatif, marge réelle), jamais recalculés différemment d'un écran à
 * l'autre. Comparatif regroupé par CATÉGORIE, avec un détail par TÂCHE en
 * plus depuis le 24 août 2026 (demandé par l'utilisatrice pour le
 * post-mortem — ProjectDetail.tsx continue d'afficher seulement le niveau
 * catégorie, confirmé "parfait" tel quel). Jointure : TimeEntry.taskId est
 * bel et bien peuplé à chaque punch depuis la Phase Punch (sélecteur
 * cascade catégorie→tâche, routes.ts l'exige) — PunchableTask.budgetModelRowId
 * et BudgetRow.modelRowId pointent vers la même BudgetModelRow, ce qui
 * relie une tâche punchée à sa ligne planifiée dans CE budgétaire précis.
 * Vide si le projet n'a pas de budgétaire d'origine (création directe).
 */
async function computeProjectFinancials(
  projectId: string,
  sold: number,
  budgetId: string | null,
  showFinancials: boolean,
  backupHourlyRate: number = 0,
): Promise<ProjectFinancials> {
  const [timeEntries, purchasesActual, settings] = await Promise.all([
    prisma.timeEntry.findMany({
      where: { projectId, status: "approved", deletedAt: null },
      select: { category: true, status: true, roundedMinutes: true, costRate: true, taskId: true },
    }),
    projectPurchasesActual(projectId),
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

  // Même fonction pure, regroupée par taskId plutôt que par category — elle
  // ne valide rien contre un ensemble de clés connues, donc ce détournement
  // est sûr (voir project-actuals.ts).
  const actualByTask = actualHoursByCategory(
    timeEntries
      .filter((entry): entry is typeof entry & { taskId: string } => entry.taskId !== null)
      .map((entry) => ({
        category: entry.taskId,
        status: entry.status,
        roundedMinutes: entry.roundedMinutes,
        costRate: Number(entry.costRate),
      })),
  );
  const actualByTaskMap = new Map(actualByTask.map((row) => [row.category, row]));

  const marginResult = projectMargin(sold, actualLaborCost, purchasesActual);
  const grossMargin = marginResult.grossMargin;
  const grossMarginPct = round2(marginResult.grossMarginPct);
  const status = financialStatus(grossMarginPct, {
    conformeThreshold: Number(settings.marginConformeThreshold),
    atRiskThreshold: Number(settings.marginAtRiskThreshold),
  });

  let comparatif: ProjectComparatifRow[] = [];
  let plannedHoursValue = 0;
  let actualHoursValue = 0;
  let actualBackupCost = 0;
  if (budgetId) {
    const budgetDetail = await getBudgetDetail(budgetId);
    const actualByCategoryMap = new Map(actualByCategory.map((row) => [row.category, row]));
    const punchableTasks = await prisma.punchableTask.findMany({
      where: { budgetModelRowId: { not: null } },
      select: { id: true, label: true, budgetModelRowId: true },
    });
    const taskByModelRowId = new Map(punchableTasks.map((task) => [task.budgetModelRowId as string, task]));
    const laborSections = budgetDetail.sections.filter((section) => section.kind === "labor");
    ({ plannedHoursValue, actualHoursValue, actualBackupCost } = computeHoursValueBase(
      laborSections,
      actualByCategoryMap,
      budgetDetail.backupHoursPct,
      backupHourlyRate,
    ));

    comparatif = laborSections.map((section) => {
      const actual = actualByCategoryMap.get(section.category);
      const rowActualHours = actual?.hours ?? 0;
      const rowActualCost = round2(actual?.cost ?? 0);
      const tasks: ProjectComparatifTaskRow[] = section.rows.map((row) => {
        const task = row.modelRowId ? taskByModelRowId.get(row.modelRowId) : undefined;
        const taskActual = task ? actualByTaskMap.get(task.id) : undefined;
        const taskActualHours = taskActual?.hours ?? 0;
        const taskActualCost = round2(taskActual?.cost ?? 0);
        const taskPlannedCost = round2(row.hours * row.hourlyRate);
        return {
          taskId: task?.id ?? row.id,
          taskLabel: task?.label ?? row.label,
          plannedHours: row.hours,
          actualHours: taskActualHours,
          hoursDelta: round2(taskActualHours - row.hours),
          ...(showFinancials && {
            plannedCost: taskPlannedCost,
            actualCost: taskActualCost,
            costDelta: round2(taskActualCost - taskPlannedCost),
          }),
        };
      });
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
        tasks,
      };
    });
  }

  return {
    actualHours,
    actualLaborCost,
    purchasesActual,
    grossMargin,
    grossMarginPct,
    status,
    comparatif,
    plannedHoursValue,
    actualHoursValue,
    actualBackupCost,
  };
}

export async function getProjectDetail(id: string, viewerPersona: Persona): Promise<ProjectDetailDto> {
  const project = await prisma.project.findUnique({
    where: { id },
    include: { contact: { select: { name: true, company: true, role: true, phone: true, email: true } }, budget: { select: { displayId: true } } },
  });
  if (!project) throw new HttpError(404, "Projet introuvable.");

  const showFinancials = canSeeFinancialValues(viewerPersona);
  const sold = Number(project.sold);
  const plannedHours = Number(project.plannedHours);
  const backupRate = project.backupHourlyRate !== null ? Number(project.backupHourlyRate) : 0;
  const {
    actualHours,
    purchasesActual,
    grossMargin,
    grossMarginPct,
    status,
    comparatif,
    plannedHoursValue,
    actualHoursValue,
    actualBackupCost,
  } = await computeProjectFinancials(project.id, sold, project.budgetId, showFinancials, backupRate);

  // Progression du projet — CORRIGÉ le 28 août 2026 (bug rapporté par
  // l'utilisatrice, avec exemple chiffré à l'appui) : chaque catégorie de
  // main-d'oeuvre valorisée à SON PROPRE taux de ligne budgétaire (voir
  // computeHoursValueBase) + le back-up séparément à son propre taux —
  // JAMAIS project.backupHourlyRate appliqué à la totalité des heures
  // planifiées/réelles comme avant (ça revenait à valoriser conception et
  // installation au taux de back-up, qui ne leur revient jamais — voir
  // ELIGIBLE_BACKUP_CATEGORIES, backup.ts). Le coût réel de main-d'oeuvre
  // (actualLaborCost, ci-dessus, au taux de COÛT de l'employé) sert
  // uniquement la marge réelle — un calcul volontairement distinct,
  // confirmé correct et inchangé par l'utilisatrice.
  //
  // Repli sur l'ancien calcul UNIQUEMENT si le projet n'a pas de budgétaire
  // d'origine (création directe) : dans ce cas, aucune ligne/catégorie n'existe
  // pour connaître un taux propre — impossible de faire mieux qu'une
  // valorisation globale au taux de back-up, seul taux disponible.
  const plannedPurchases = Number(project.plannedPurchases);
  const plannedBase = project.budgetId
    ? round2(plannedHoursValue + Number(project.backupHoursCost) + plannedPurchases)
    : plannedHours * backupRate + plannedPurchases;
  const actualBase = project.budgetId
    ? round2(actualHoursValue + actualBackupCost + purchasesActual)
    : actualHours * backupRate + purchasesActual;
  const progressionPct = plannedBase > 0 ? round2((actualBase / plannedBase) * 100) : 0;

  return {
    id: project.id,
    projectNumber: project.projectNumber,
    name: project.name,
    status: project.status,
    contactId: project.contactId,
    contactName: project.contact.name,
    company: project.contact.company,
    contactRole: project.contact.role,
    contactPhone: project.contact.phone,
    contactEmail: project.contact.email,
    budgetId: project.budgetId,
    budgetDisplayId: project.budget?.displayId ?? null,
    clientRequestId: project.clientRequestId,
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
    deadline: project.deadline?.toISOString() ?? null,
    archivedAt: project.archivedAt?.toISOString() ?? null,
    deletedAt: project.deletedAt?.toISOString() ?? null,
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
      backupHourlyRate: project.backupHourlyRate !== null ? Number(project.backupHourlyRate) : null,
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

// Exporté — réutilisé tel quel par rollings/service.ts (même format, même
// calcul de statut) pour éviter un deuxième mapping divergent.
export function toInvoicePlanEntryDto(row: {
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
  const rows = await prisma.invoicePlanEntry.findMany({ where: { projectId }, orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }] });
  return rows.map(toInvoicePlanEntryDto);
}

/**
 * Remplace entièrement le cycle de facturation d'un projet par une
 * répartition personnalisée (26 août 2026, confirmé avec l'utilisatrice :
 * jalons entièrement personnalisables — pas seulement les % des 4 jalons
 * par défaut, un vrai projet a besoin d'un cycle à seulement 2 jalons : 30 %
 * après conception / 70 % après installation). Réutilise computeBillingPlan
 * (billing.ts, jamais modifié) tel quel — jamais un deuxième calcul de
 * montants divergent. Bloqué dès qu'un seul jalon a déjà été
 * demandé/facturé/payé : à ce stade le suivi réel a commencé (Sage reste la
 * source réelle des factures), le remplacer casserait cet historique — même
 * porte que "Demander la facturation" (canRequestInvoice, Direction
 * seulement).
 */
export async function updateProjectBillingPlan(projectId: string, steps: BillingSplitStep[]): Promise<InvoicePlanEntryDto[]> {
  const project = await prisma.project.findUnique({ where: { id: projectId } });
  if (!project) throw new HttpError(404, "Projet introuvable.");

  const existing = await prisma.invoicePlanEntry.findMany({ where: { projectId } });
  const started = existing.some((entry) => entry.requestedAt || entry.invoiceNumber || Number(entry.paidAmount) > 0);
  if (started) {
    throw new HttpError(409, "Impossible de remplacer le cycle : au moins un jalon a déjà été demandé, facturé ou payé.");
  }

  const totalPct = steps.reduce((sum, step) => sum + Number(step.pct || 0), 0);
  if (Math.round(totalPct) !== 100) throw new HttpError(400, `Le cycle doit totaliser exactement 100 % (obtenu ${totalPct}%).`);

  const plan = computeBillingPlan(Number(project.sold), steps);

  await prisma.$transaction([
    prisma.invoicePlanEntry.deleteMany({ where: { projectId } }),
    prisma.invoicePlanEntry.createMany({
      data: plan.map((step, index) => ({ projectId, label: step.label, pct: step.pct, amount: step.amount, status: step.status, sortOrder: index })),
    }),
    prisma.project.update({
      where: { id: projectId },
      data: { billingSplitOverride: JSON.parse(JSON.stringify(steps)) },
    }),
  ]);

  return getInvoicePlan(projectId);
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

/**
 * Montant du NOUVEAU versement reçu — s'ajoute au paidAmount déjà accumulé
 * (pas un historique de paiements séparé, toujours un seul champ cumulatif —
 * seule la façon de le faire progresser change). Avant le 31 août 2026,
 * l'usager devait ressaisir le total cumulatif à chaque versement (recalculé
 * de tête à chaque fois) — corrigé sur rapport de l'utilisatrice : la case
 * n'accepte maintenant QUE le montant de ce versement, additionné ici.
 */
export async function recordInvoicePayment(entryId: string, amount: number): Promise<InvoicePlanEntryDto> {
  if (!(amount > 0)) throw new HttpError(400, "Le montant du paiement doit être positif.");
  const entry = await prisma.invoicePlanEntry.findUnique({ where: { id: entryId } });
  if (!entry) throw new HttpError(404, "Jalon de facturation introuvable.");
  if (!entry.invoiceNumber) throw new HttpError(400, "Cette facture n'est pas encore enregistrée.");
  const row = await prisma.invoicePlanEntry.update({
    where: { id: entryId },
    data: { paidAmount: Number(entry.paidAmount) + amount, paidAt: new Date() },
  });
  return toInvoicePlanEntryDto(row);
}

/** Suspendre le suivi d'une facture (litige, attente d'un changement — voir canHoldInvoice, roles.ts). */
export async function holdInvoiceEntry(entryId: string): Promise<InvoicePlanEntryDto> {
  const entry = await prisma.invoicePlanEntry.findUnique({ where: { id: entryId } });
  if (!entry) throw new HttpError(404, "Jalon de facturation introuvable.");
  if (!entry.invoiceNumber) throw new HttpError(400, "Cette facture n'est pas encore enregistrée.");
  const row = await prisma.invoicePlanEntry.update({ where: { id: entryId }, data: { status: "on_hold" } });
  return toInvoicePlanEntryDto(row);
}

/** Retire la suspension — restaure "sent", d'où invoiceStatus() (billing.ts) recalcule normalement payé/en retard/envoyée depuis les autres champs, rien à mémoriser en plus. */
export async function releaseInvoiceHold(entryId: string): Promise<InvoicePlanEntryDto> {
  const entry = await prisma.invoicePlanEntry.findUnique({ where: { id: entryId } });
  if (!entry) throw new HttpError(404, "Jalon de facturation introuvable.");
  if (entry.status !== "on_hold") throw new HttpError(400, "Cette facture n'est pas en suspens.");
  const row = await prisma.invoicePlanEntry.update({ where: { id: entryId }, data: { status: "sent" } });
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

// ---------------------------------------------------------------------------
// Menu Options du projet (Projet 2F, 17 août 2026) — confirmé par capture
// d'écran du menu (« Modifier les informations » / « Renommer » / « Modifier
// la date d'échéance » regroupés ici en une seule action ; « Actions
// sensibles » = archiver/supprimer, Direction seulement). Gantt, avenants,
// punch d'heures et le module Appels de service restent hors de cette phase
// (modules pas encore construits, ou explicitement une phase séparée).
// ---------------------------------------------------------------------------

export interface UpdateProjectInfoInput {
  name?: string;
  deadline?: string | null;
}

export async function updateProjectInfo(projectId: string, input: UpdateProjectInfoInput): Promise<void> {
  const project = await prisma.project.findUnique({ where: { id: projectId } });
  if (!project) throw new HttpError(404, "Projet introuvable.");
  await prisma.project.update({
    where: { id: projectId },
    data: {
      ...(input.name !== undefined && { name: input.name }),
      ...(input.deadline !== undefined && { deadline: input.deadline ? new Date(input.deadline) : null }),
    },
  });
}

/** Archiver/désarchiver — distinct de Fermer (closedAt) : reste pleinement accessible par lien direct, seulement sorti des listes actives (listProjects). */
export async function setProjectArchived(projectId: string, archived: boolean): Promise<void> {
  const project = await prisma.project.findUnique({ where: { id: projectId } });
  if (!project) throw new HttpError(404, "Projet introuvable.");
  await prisma.project.update({ where: { id: projectId }, data: { archivedAt: archived ? new Date() : null } });
}

/** Corbeille — mécanisme seulement (deletedAt, masqué des listes actives). L'écran de restauration 90 jours attend le module Paramètres complet (confirmé, hors de cette phase). */
export async function deleteProject(projectId: string): Promise<void> {
  const project = await prisma.project.findUnique({ where: { id: projectId } });
  if (!project) throw new HttpError(404, "Projet introuvable.");
  if (project.deletedAt) throw new HttpError(400, "Ce projet est déjà dans la corbeille.");
  await prisma.project.update({ where: { id: projectId }, data: { deletedAt: new Date() } });
}

export interface HistoryEventDto {
  at: string;
  label: string;
  actorName?: string;
}

/**
 * Historique complet — première version, agrégée à la lecture à partir des
 * tables déjà horodatées (garantie, cycle de facturation, achats réels)
 * plutôt qu'un nouveau journal d'audit générique à écrire dans chaque action
 * existante déjà testée (risque de régression pour un simple menu). Les
 * demandes/enregistrements de facturation n'ont pas encore de nom résolu
 * (seulement l'id) — acceptable pour une première version, jamais deviné.
 */
export async function getProjectHistory(projectId: string): Promise<HistoryEventDto[]> {
  const project = await prisma.project.findUnique({ where: { id: projectId }, select: { createdAt: true, createdById: true } });
  if (!project) throw new HttpError(404, "Projet introuvable.");

  const [warrantyHistory, invoiceEntries, purchaseEntries, creator] = await Promise.all([
    getWarrantyHistory(projectId),
    getInvoicePlan(projectId),
    listProjectPurchaseEntries(projectId),
    prisma.employee.findUnique({ where: { id: project.createdById }, select: { name: true } }),
  ]);

  const events: HistoryEventDto[] = [{ at: project.createdAt.toISOString(), label: "Projet créé", actorName: creator?.name }];

  for (const entry of warrantyHistory) {
    events.push({
      at: entry.changedAt,
      label: entry.previousEndsAt
        ? `Garantie modifiée — nouvelle fin : ${entry.newEndsAt.slice(0, 10)}`
        : `Garantie activée — fin : ${entry.newEndsAt.slice(0, 10)}`,
      actorName: entry.changedByName,
    });
  }

  for (const entry of invoiceEntries) {
    if (entry.requestedAt) events.push({ at: entry.requestedAt, label: `Facturation demandée — ${entry.label}` });
    if (entry.processedAt) events.push({ at: entry.processedAt, label: `Facture enregistrée — ${entry.label}${entry.invoiceNumber ? ` (${entry.invoiceNumber})` : ""}` });
    if (entry.paidAt) events.push({ at: entry.paidAt, label: `Paiement enregistré — ${entry.label}` });
  }

  for (const entry of purchaseEntries) {
    events.push({ at: entry.createdAt, label: `Achat ajouté — ${entry.description}`, actorName: entry.enteredByName });
    if (entry.approvedAt) events.push({ at: entry.approvedAt, label: `Achat approuvé — ${entry.description}`, actorName: entry.approvedByName ?? undefined });
  }

  return events.sort((a, b) => (a.at < b.at ? 1 : -1));
}

// ---------------------------------------------------------------------------
// Post-mortem (Projet 2E, 17 août 2026) — mêmes chiffres que le reste du
// module (computeProjectFinancials, réutilisé tel quel), plus l'« Analyse
// finale » (3 champs texte, seule vraie nouvelle donnée). Confirmé le 17
// août 2026 : la vue sera réutilisée telle quelle par le futur module
// Rapports (sélection d'un projet dans les rapports post-mortem) — aucune
// dépendance bloquante pour la construire maintenant, mais aucune logique
// propre à l'écran ProjectDetail ne doit s'y infiltrer. Le détail du
// Comparatif main-d'oeuvre par sous-tâche reste hors de cette étape
// (confirmé complexe par l'utilisatrice, spécification à venir) — le
// comparatif ci-dessous reste au niveau catégorie, comme partout ailleurs.
// ---------------------------------------------------------------------------

export interface PostMortemCostRow {
  label: string;
  planned: number;
  actual: number;
}

export interface PostMortemDto {
  id: string;
  projectNumber: string;
  name: string;
  plannedHours: number;
  actualHours: number;
  backupHours: number;
  comparatif: ProjectComparatifRow[];
  sold?: number;
  plannedPurchases?: number;
  actualPurchases?: number;
  backupHoursCost?: number;
  projectBackupAmount?: number;
  grossMargin?: number;
  grossMarginPct?: number;
  financialStatus?: FinancialStatus;
  costBreakdown?: PostMortemCostRow[];
  postMortemDepassements: string | null;
  postMortemAmeliorations: string | null;
  postMortemRecommandation: string | null;
}

export async function getPostMortem(id: string, viewerPersona: Persona): Promise<PostMortemDto> {
  const project = await prisma.project.findUnique({ where: { id } });
  if (!project) throw new HttpError(404, "Projet introuvable.");

  const showFinancials = canSeeFinancialValues(viewerPersona);
  const sold = Number(project.sold);
  const plannedHours = Number(project.plannedHours);
  const { actualHours, actualLaborCost, purchasesActual, grossMargin, grossMarginPct, status, comparatif } =
    await computeProjectFinancials(project.id, sold, project.budgetId, showFinancials);

  const plannedPurchases = Number(project.plannedPurchases);
  const backupHoursCost = Number(project.backupHoursCost);
  const projectBackupAmount = Number(project.projectBackupAmount);
  // Coût planifié de main-d'oeuvre = somme du comparatif (déjà calculé par
  // section budgétaire) — jamais un deuxième calcul séparé qui pourrait
  // diverger. Back-up "réel" reste toujours à 0 : c'est une réserve, jamais
  // consommée par un mécanisme suivi (aucun geste de "dépenser le back-up"
  // n'existe dans l'application) — confirmé par la même logique que la
  // marge réelle (projectMargin), qui ne compte jamais le back-up comme un
  // coût réel.
  const plannedLaborCost = round2(comparatif.reduce((sum, row) => sum + (row.plannedCost ?? 0), 0));

  return {
    id: project.id,
    projectNumber: project.projectNumber,
    name: project.name,
    plannedHours,
    actualHours,
    backupHours: Number(project.backupHours),
    comparatif,
    postMortemDepassements: project.postMortemDepassements,
    postMortemAmeliorations: project.postMortemAmeliorations,
    postMortemRecommandation: project.postMortemRecommandation,
    ...(showFinancials && {
      sold,
      plannedPurchases,
      actualPurchases: purchasesActual,
      backupHoursCost,
      projectBackupAmount,
      grossMargin,
      grossMarginPct,
      financialStatus: status,
      costBreakdown: [
        { label: "Main-d'oeuvre", planned: plannedLaborCost, actual: actualLaborCost },
        { label: "Achats et frais", planned: plannedPurchases, actual: purchasesActual },
        { label: "Back-up d'heures", planned: backupHoursCost, actual: 0 },
        { label: "Back-up projet", planned: projectBackupAmount, actual: 0 },
      ],
    }),
  };
}

export interface UpdatePostMortemInput {
  depassements?: string;
  ameliorations?: string;
  recommandation?: string;
}

export async function updatePostMortemAnalysis(projectId: string, input: UpdatePostMortemInput): Promise<void> {
  const project = await prisma.project.findUnique({ where: { id: projectId } });
  if (!project) throw new HttpError(404, "Projet introuvable.");
  await prisma.project.update({
    where: { id: projectId },
    data: {
      ...(input.depassements !== undefined && { postMortemDepassements: input.depassements || null }),
      ...(input.ameliorations !== undefined && { postMortemAmeliorations: input.ameliorations || null }),
      ...(input.recommandation !== undefined && { postMortemRecommandation: input.recommandation || null }),
    },
  });
}

export interface ApprovedTimeEntryDto {
  id: string;
  date: string;
  employeeName: string;
  category: string;
  taskLabel: string;
  hours: number;
  cost?: number;
}

/**
 * « Détail des heures approuvées » — drill-down des punchs individuels
 * (confirmé le 17 août 2026). Tâche affichée depuis le 24 août 2026 (même
 * remarque que le comparatif détaillé par tâche du post-mortem — signalée
 * manquante ici aussi par l'utilisatrice) — TimeEntry.taskId directement,
 * jamais besoin du détour par BudgetRow.modelRowId comme dans
 * computeProjectFinancials, puisqu'il n'y a pas de planifié à joindre ici.
 */
export async function getApprovedTimeEntries(projectId: string, showFinancials: boolean): Promise<ApprovedTimeEntryDto[]> {
  const entries = await prisma.timeEntry.findMany({
    where: { projectId, status: "approved", deletedAt: null },
    select: { id: true, date: true, employeeId: true, category: true, taskId: true, roundedMinutes: true, costRate: true },
    orderBy: { date: "desc" },
  });
  const employeeIds = [...new Set(entries.map((entry) => entry.employeeId))];
  const taskIds = [...new Set(entries.map((entry) => entry.taskId).filter((id): id is string => id !== null))];
  const [employees, tasks] = await Promise.all([
    prisma.employee.findMany({ where: { id: { in: employeeIds } }, select: { id: true, name: true } }),
    prisma.punchableTask.findMany({ where: { id: { in: taskIds } }, select: { id: true, label: true } }),
  ]);
  const nameById = new Map(employees.map((employee) => [employee.id, employee.name]));
  const taskLabelById = new Map(tasks.map((task) => [task.id, task.label]));

  return entries.map((entry) => {
    const hours = round2((entry.roundedMinutes ?? 0) / 60);
    return {
      id: entry.id,
      date: entry.date.toISOString(),
      employeeName: nameById.get(entry.employeeId) ?? "—",
      category: BUDGET_CATEGORY_LABELS[entry.category as BudgetCategorySlug] ?? entry.category,
      taskLabel: (entry.taskId ? taskLabelById.get(entry.taskId) : undefined) ?? "—",
      hours,
      ...(showFinancials && { cost: round2(hours * Number(entry.costRate)) }),
    };
  });
}

export interface ApprovedPurchaseEntryDto {
  id: string;
  date: string;
  source: string;
  category: string;
  description: string;
  supplier: string | null;
  amount?: number;
}

/**
 * « Détail des achats approuvés » — drill-down des deux sources combinées
 * dans purchasesActual (projectPurchasesActual, purchases/service.ts),
 * mêmes deux requêtes, jamais un total recalculé différemment. Ajouté à la
 * demande de l'utilisatrice le 17 août 2026, même esprit que
 * getApprovedTimeEntries ci-dessus.
 */
export async function getApprovedPurchaseEntries(projectId: string, showFinancials: boolean): Promise<ApprovedPurchaseEntryDto[]> {
  const [requests, entries] = await Promise.all([
    prisma.purchaseRequest.findMany({
      where: { projectId, appliedToProjectAt: { not: null } },
      select: {
        id: true,
        appliedToProjectAt: true,
        description: true,
        supplier: true,
        amount: true,
        category: { select: { name: true } },
      },
    }),
    prisma.projectPurchaseEntry.findMany({
      where: { projectId, status: "approved" },
      select: { id: true, date: true, category: true, description: true, supplier: true, amount: true },
    }),
  ]);

  const rows: ApprovedPurchaseEntryDto[] = [
    ...requests.map((request) => ({
      id: request.id,
      date: (request.appliedToProjectAt as Date).toISOString(),
      source: "Demande d'achat",
      category: request.category?.name ?? "Sans catégorie",
      description: request.description,
      supplier: request.supplier,
      ...(showFinancials && { amount: round2(Number(request.amount ?? 0)) }),
    })),
    ...entries.map((entry) => ({
      id: entry.id,
      date: entry.date.toISOString(),
      source: "Achat direct",
      category: entry.category,
      description: entry.description,
      supplier: entry.supplier,
      ...(showFinancials && { amount: round2(Number(entry.amount)) }),
    })),
  ];

  return rows.sort((a, b) => (a.date < b.date ? 1 : -1));
}
