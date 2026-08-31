/**
 * GSC Pilot — Roulements (20 août 2026)
 *
 * Confirmé (spécification, section « Roulements ») : proviennent en général
 * d'une demande client (via un budgétaire, comme un projet), mais doivent
 * aussi pouvoir être créés directement. Cycle de facturation par défaut : UN
 * SEUL PAIEMENT (pas DEFAULT_BILLING_SPLIT/Settings.defaultBillingSplit,
 * réservés aux projets) — computeBillingPlan (billing.ts, jamais modifié)
 * réutilisé avec un split à une seule étape. Fin de production → sortie
 * (3 modes seulement : Bon de livraison/magasinier, tiers, ramassage client
 * — PAS Installation, qui n'a de sens que pour un projet avec une section
 * Installation du budgétaire) → statut "Terminé" (même valeur interne
 * "ready_invoice" que Project, juste relabellisée côté interface) →
 * Post-mortem.
 *
 * Comparatif planifié/réel + coût réel (28 août 2026, demande de
 * l'utilisatrice — « je veux les mêmes tuiles/Progression/Comparatif/Achats
 * réels que Projet ») : voir computeRollingFinancials, qui réutilise
 * computeHoursValueBase (projects/service.ts) telle quelle. SEULE différence
 * confirmée avec Project : « il n'y a pas de taux back-up sur un roulement »
 * — computeRollingFinancials appelle computeHoursValueBase avec
 * backupPct/backupHourlyRate à 0 (jamais Rolling.backupHours*, qui restent
 * volontairement inutilisés, voir schema.prisma) et n'ajoute aucun terme de
 * back-up à la Progression.
 *
 * fulfillment.ts est réutilisé tel quel via son interface FulfillmentEntity
 * générique (déjà anticipée : Rolling a exactement les mêmes noms de champs
 * que Project pour la production/sortie) — aucune ligne de logique dupliquée
 * ou réimplémentée ici.
 */
import {
  computeBillingPlan,
  FULFILLMENT_MODES,
  chooseFulfillment as chooseFulfillmentPure,
  confirmFulfillment as confirmFulfillmentPure,
  canSeeFinancialValues,
  projectMargin,
  financialStatus,
  actualHoursByCategory,
  BUDGET_CATEGORY_LABELS,
  type BudgetCategorySlug,
  type FinancialStatus,
  type FulfillmentMode,
  type Persona,
} from "@gsc-pilot/business-rules";
import { prisma } from "../../db.js";
import { HttpError } from "../../middleware/errorHandler.js";
import { getBudgetDetail } from "../budgets/service.js";
import { ensureContactRow } from "../clientRequests/service.js";
import { rollingPurchasesActual } from "../purchases/service.js";
import {
  toInvoicePlanEntryDto,
  computeHoursValueBase,
  type InvoicePlanEntryDto,
  type ProjectComparatifRow,
  type ApprovedTimeEntryDto,
} from "../projects/service.js";
import type { Budget, Rolling } from "../../generated/prisma/client.js";

function round2(value: number): number {
  return Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100;
}

// N'accepte jamais FULFILLMENT_MODES.INSTALLATION — seuls les 3 modes de
// livraison classiques ont un sens pour un roulement (spec confirmée).
type RollingFulfillmentMode = typeof FULFILLMENT_MODES.WAREHOUSE | typeof FULFILLMENT_MODES.MANUAL | typeof FULFILLMENT_MODES.PICKUP;

export interface RollingListItemDto {
  id: string;
  rollingNumber: string;
  contactName: string;
  company: string | null;
  status: string;
  sold?: number;
  fulfillmentMode: string | null;
  fulfillmentStatus: string | null;
  createdAt: string;
}

export async function listRollings(viewerPersona: Persona): Promise<RollingListItemDto[]> {
  const showFinancials = canSeeFinancialValues(viewerPersona);
  const rollings = await prisma.rolling.findMany({
    where: { archivedAt: null, deletedAt: null },
    include: { contact: { select: { name: true, company: true } } },
    orderBy: { createdAt: "desc" },
  });
  return rollings.map((rolling) => ({
    id: rolling.id,
    rollingNumber: rolling.rollingNumber,
    contactName: rolling.contact.name,
    company: rolling.contact.company,
    status: rolling.status,
    fulfillmentMode: rolling.fulfillmentMode,
    fulfillmentStatus: rolling.fulfillmentStatus,
    createdAt: rolling.createdAt.toISOString(),
    ...(showFinancials && { sold: Number(rolling.sold) }),
  }));
}

export interface RollingDetailDto {
  id: string;
  rollingNumber: string;
  contactId: string;
  contactName: string;
  company: string | null;
  contactPhone: string | null;
  contactEmail: string | null;
  status: string;
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
  fulfillmentDriverId: string | null;
  fulfillmentDriverName: string | null;
  fulfillmentScheduled: string | null;
  fulfillmentConfirmationNote: string | null;
  billingReady: boolean;
  archivedAt: string | null;
  deletedAt: string | null;
}

interface RollingFinancials {
  actualHours: number;
  actualLaborCost: number;
  purchasesActual: number;
  grossMargin: number;
  grossMarginPct: number;
  status: FinancialStatus;
  comparatif: ProjectComparatifRow[];
  plannedHoursValue: number;
  actualHoursValue: number;
}

/**
 * Calcul financier du roulement — même esprit que computeProjectFinancials
 * (projects/service.ts, réutilisée via computeHoursValueBase, jamais
 * réimplémentée), adapté à TimeEntry.rollingId/ProjectPurchaseEntry.rollingId
 * plutôt que projectId. SEULE différence confirmée avec Project : pas de
 * terme de back-up — computeHoursValueBase appelé avec
 * backupPct/backupHourlyRate à 0 (voir en-tête de fichier), donc
 * plannedHoursValue/actualHoursValue ne contiennent jamais de composante
 * back-up ici. Comparatif regroupé par catégorie seulement (pas de détail
 * par tâche — jamais demandé pour Roulement, contrairement au post-mortem
 * projet).
 */
async function computeRollingFinancials(
  rollingId: string,
  sold: number,
  budgetId: string | null,
  showFinancials: boolean,
): Promise<RollingFinancials> {
  const [timeEntries, purchasesActual, settings] = await Promise.all([
    prisma.timeEntry.findMany({
      where: { rollingId, status: "approved", deletedAt: null },
      select: { category: true, status: true, roundedMinutes: true, costRate: true },
    }),
    rollingPurchasesActual(rollingId),
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
  if (budgetId) {
    const budgetDetail = await getBudgetDetail(budgetId);
    const actualByCategoryMap = new Map(actualByCategory.map((row) => [row.category, row]));
    const laborSections = budgetDetail.sections.filter((section) => section.kind === "labor");
    // Pas de taux back-up sur un roulement (confirmé 28 août 2026) — 0/0
    // garantit que computeHoursValueBase n'ajoute jamais de composante
    // back-up, sans dupliquer sa logique.
    ({ plannedHoursValue, actualHoursValue } = computeHoursValueBase(laborSections, actualByCategoryMap, 0, 0));

    comparatif = laborSections.map((section) => {
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

  return { actualHours, actualLaborCost, purchasesActual, grossMargin, grossMarginPct, status, comparatif, plannedHoursValue, actualHoursValue };
}

export async function getRollingDetail(id: string, viewerPersona: Persona): Promise<RollingDetailDto> {
  const rolling = await prisma.rolling.findUnique({
    where: { id },
    include: { contact: true, budget: { select: { displayId: true } } },
  });
  if (!rolling) throw new HttpError(404, "Roulement introuvable.");

  // fulfillmentDriverId reste un scalaire simple (pas de relation Prisma),
  // même patron que Delivery.driverEmployeeId — nom résolu séparément.
  const driver = rolling.fulfillmentDriverId
    ? await prisma.employee.findUnique({ where: { id: rolling.fulfillmentDriverId }, select: { name: true } })
    : null;

  const showFinancials = canSeeFinancialValues(viewerPersona);
  const sold = Number(rolling.sold);
  const plannedHours = Number(rolling.plannedHours);
  const plannedPurchases = Number(rolling.plannedPurchases);
  const { actualHours, purchasesActual, grossMargin, grossMarginPct, status, comparatif, plannedHoursValue, actualHoursValue } =
    await computeRollingFinancials(rolling.id, sold, rolling.budgetId, showFinancials);

  // Progression du roulement — jamais de terme de back-up (voir
  // computeRollingFinancials). plannedHoursValue/actualHoursValue valent 0
  // sans budgétaire d'origine, donc cette formule reste correcte même pour
  // un roulement créé directement (aucun repli séparé nécessaire,
  // contrairement à Project qui doit gérer un plannedHours saisi à la main
  // sans budgétaire — pas encore possible pour Rolling).
  const plannedBase = round2(plannedHoursValue + plannedPurchases);
  const actualBase = round2(actualHoursValue + purchasesActual);
  const progressionPct = plannedBase > 0 ? round2((actualBase / plannedBase) * 100) : 0;

  return {
    id: rolling.id,
    rollingNumber: rolling.rollingNumber,
    contactId: rolling.contactId,
    contactName: rolling.contact.name,
    company: rolling.contact.company,
    contactPhone: rolling.contact.phone,
    contactEmail: rolling.contact.email,
    status: rolling.status,
    budgetId: rolling.budgetId,
    budgetDisplayId: rolling.budget?.displayId ?? null,
    clientRequestId: rolling.clientRequestId,
    createdAt: rolling.createdAt.toISOString(),
    plannedHours,
    actualHours,
    hoursUsedPct: plannedHours > 0 ? round2((actualHours / plannedHours) * 100) : 0,
    comparatif,
    productionCompleted: rolling.productionCompleted,
    fulfillmentMode: rolling.fulfillmentMode,
    fulfillmentStatus: rolling.fulfillmentStatus,
    fulfillmentAddress: rolling.fulfillmentAddress,
    fulfillmentDriverId: rolling.fulfillmentDriverId,
    fulfillmentDriverName: driver?.name ?? null,
    fulfillmentScheduled: rolling.fulfillmentScheduled?.toISOString() ?? null,
    fulfillmentConfirmationNote: rolling.fulfillmentConfirmationNote,
    billingReady: rolling.billingReady,
    archivedAt: rolling.archivedAt?.toISOString() ?? null,
    deletedAt: rolling.deletedAt?.toISOString() ?? null,
    ...(showFinancials && {
      sold,
      plannedPurchases,
      actualPurchases: purchasesActual,
      grossMargin,
      grossMarginPct,
      targetMarginPct: rolling.targetMarginPct !== null ? Number(rolling.targetMarginPct) : null,
      financialStatus: status,
      progressionPct,
    }),
  };
}

/** Génère le plan de facturation à UN SEUL PAIEMENT — jamais DEFAULT_BILLING_SPLIT/Settings.defaultBillingSplit (réservés aux projets). */
async function createSinglePaymentPlan(tx: Parameters<Parameters<typeof prisma.$transaction>[0]>[0], rollingId: string, sold: number) {
  if (!(sold > 0)) return;
  const plan = computeBillingPlan(sold, [{ label: "Paiement", pct: 100 }]);
  await tx.invoicePlanEntry.createMany({
    data: plan.map((step, index) => ({ rollingId, label: step.label, pct: step.pct, amount: step.amount, status: step.status, sortOrder: index })),
  });
}

async function assertBudgetNotAlreadyConverted(budgetId: string): Promise<void> {
  const [existingProject, existingRolling] = await Promise.all([
    prisma.project.findUnique({ where: { budgetId } }),
    prisma.rolling.findUnique({ where: { budgetId } }),
  ]);
  if (existingProject) throw new HttpError(400, "Ce budgétaire a déjà été converti en projet.");
  if (existingRolling) throw new HttpError(400, "Ce budgétaire a déjà été converti en roulement.");
}

/** plannedHours/plannedPurchases/targetMarginPct figés depuis le budgétaire — même formule pour une conversion normale et une liaison à un roulement déjà existant (jamais backupHours/backupHoursCost/backupHourlyRate, voir en-tête de fichier : pas de taux back-up sur un roulement). */
async function computeRollingFieldsFromBudget(budgetId: string) {
  const detail = await getBudgetDetail(budgetId);
  const totalSale = detail.totals.totalSale;
  const laborSections = detail.sections.filter((section) => section.kind === "labor");
  const purchaseSections = detail.sections.filter((section) => section.kind === "purchase");
  const plannedHours = laborSections.reduce((sum, section) => sum + section.hours, 0);
  const plannedPurchases = purchaseSections.reduce((sum, section) => sum + section.baseCost, 0);
  const totalBaseCost = detail.totals.totalBaseCost;
  const targetMarginPct = totalSale > 0 ? Math.round(((totalSale - totalBaseCost) / totalSale) * 100 * 100) / 100 : 0;
  return { totalSale, plannedHours, plannedPurchases, targetMarginPct };
}

/**
 * Budgétaire construit APRÈS coup pour un roulement créé directement (31
 * août 2026, demande explicite : « la création du budgétaire d'un nouveau
 * roulement doit se faire après la création de celle-ci »). Contrairement à
 * la conversion normale ci-dessous, MET À JOUR le roulement déjà existant
 * (même id, même rollingNumber) au lieu d'en créer un nouveau — et n'exige
 * PAS le statut « Gagné » : le roulement existe déjà, donc le contrat est
 * déjà confirmé dans les faits (confirmé avec l'utilisatrice).
 */
async function attachBudgetToExistingRolling(budget: Budget): Promise<Rolling> {
  const rolling = await prisma.rolling.findUnique({ where: { id: budget.rollingId! } });
  if (!rolling) throw new HttpError(404, "Roulement introuvable pour ce budgétaire.");
  if (rolling.budgetId) throw new HttpError(400, "Ce roulement a déjà un budgétaire attaché.");

  const { totalSale, plannedHours, plannedPurchases, targetMarginPct } = await computeRollingFieldsFromBudget(budget.id);

  return prisma.$transaction(async (tx) => {
    const updated = await tx.rolling.update({
      where: { id: rolling.id },
      data: { budgetId: budget.id, sold: totalSale, plannedHours, plannedPurchases, targetMarginPct },
    });
    const existingPlan = await tx.invoicePlanEntry.count({ where: { rollingId: rolling.id } });
    if (existingPlan === 0) await createSinglePaymentPlan(tx, rolling.id, totalSale);
    return updated;
  });
}

export async function convertBudgetToRolling(createdById: string, budgetId: string): Promise<Rolling> {
  const budget = await prisma.budget.findUnique({ where: { id: budgetId } });
  if (!budget) throw new HttpError(404, "Budgétaire introuvable.");

  await assertBudgetNotAlreadyConverted(budgetId);

  if (budget.rollingId) {
    return attachBudgetToExistingRolling(budget);
  }

  if (budget.status !== "won") throw new HttpError(400, "Seul un budgétaire au statut « Contrat obtenu » peut être converti en roulement.");

  if (!budget.clientRequestId) {
    throw new HttpError(500, "Ce budgétaire n'a pas de demande client associée — impossible de déterminer le contact du roulement.");
  }
  const clientRequest = await prisma.clientRequest.findUnique({ where: { id: budget.clientRequestId }, select: { contactId: true } });
  if (!clientRequest) throw new HttpError(500, "Demande client introuvable pour ce budgétaire.");

  const { totalSale, plannedHours, plannedPurchases, targetMarginPct } = await computeRollingFieldsFromBudget(budgetId);

  return prisma.$transaction(async (tx) => {
    const settings = await tx.settings.findFirst();
    if (!settings) throw new HttpError(500, "Paramètres non initialisés — lancer le seed.");
    const rollingNumber = `RL-${new Date().getFullYear()}-${String(settings.nextRollingNumber).padStart(4, "0")}`;
    const rolling = await tx.rolling.create({
      data: {
        rollingNumber,
        contactId: clientRequest.contactId,
        clientRequestId: budget.clientRequestId,
        budgetId: budget.id,
        status: "active",
        sold: totalSale,
        plannedHours,
        plannedPurchases,
        targetMarginPct,
        createdById,
      },
    });
    await tx.settings.update({ where: { id: settings.id }, data: { nextRollingNumber: settings.nextRollingNumber + 1 } });
    await createSinglePaymentPlan(tx, rolling.id, totalSale);
    return rolling;
  });
}

export interface NewRollingContactInput {
  contactName: string;
  company?: string;
  contactRole?: string;
  phone?: string;
  email?: string;
}

/**
 * Conversion directe d'une demande client en roulement (31 août 2026,
 * demande explicite de l'utilisatrice) — même mécanique que Budget/
 * ServiceCall↔ClientRequest : validée AVANT la transaction, puis
 * ClientRequest.status posé à "converted" DANS la même transaction que la
 * création du roulement. Contrairement à budgetId/serviceCallId (colonnes
 * directes sur ClientRequest), la relation gérée vit sur
 * Rolling.clientRequestId (@unique) — voir schema.prisma.
 */
async function assertClientRequestConvertibleToRolling(clientRequestId: string): Promise<void> {
  const request = await prisma.clientRequest.findUnique({ where: { id: clientRequestId }, select: { id: true } });
  if (!request) throw new HttpError(404, "Demande client introuvable.");
  const existing = await prisma.rolling.findUnique({ where: { clientRequestId }, select: { id: true } });
  if (existing) throw new HttpError(400, "Cette demande a déjà un roulement.");
}

/**
 * Création directe (hors budgétaire, avec ou sans demande client) —
 * Direction et Propriétaire seulement (canCreateRollingDirectly, roles.ts).
 * Pas de champ "nom" : contrairement à Project, Rolling n'a pas de
 * displayId basé sur un nom — identifié par son contact, mais porte depuis
 * le 28 août 2026 un numéro d'affichage RL-AAAA-NNNN (même patron que
 * CS-AAAA-NNNN) pour le Code QR et Scan QR.
 */
export async function createRollingDirect(createdById: string, newContact: NewRollingContactInput, clientRequestId?: string): Promise<Rolling> {
  if (!newContact.contactName?.trim()) throw new HttpError(400, "Le nom du contact est requis.");
  if (clientRequestId) await assertClientRequestConvertibleToRolling(clientRequestId);
  const contact = await ensureContactRow({ ...newContact, requestType: "rolling" });
  return prisma.$transaction(async (tx) => {
    const settings = await tx.settings.findFirst();
    if (!settings) throw new HttpError(500, "Paramètres non initialisés — lancer le seed.");
    const rollingNumber = `RL-${new Date().getFullYear()}-${String(settings.nextRollingNumber).padStart(4, "0")}`;
    const rolling = await tx.rolling.create({
      data: { rollingNumber, contactId: contact.id, clientRequestId: clientRequestId ?? null, status: "active", createdDirectly: true, createdById },
    });
    await tx.settings.update({ where: { id: settings.id }, data: { nextRollingNumber: settings.nextRollingNumber + 1 } });
    if (clientRequestId) {
      await tx.clientRequest.update({ where: { id: clientRequestId }, data: { status: "converted" } });
    }
    return rolling;
  });
}

/**
 * Remplir le prix vendu après une création directe (aucun budgétaire donc
 * aucun prix connu à la création) — même principe que updateProjectPlanning
 * (projects/service.ts) : plan généré une seule fois, la première fois que
 * sold devient > 0. Réservé aux roulements sans budgétaire d'origine (même
 * garde que côté projet).
 */
export async function updateRollingSold(rollingId: string, sold: number): Promise<void> {
  const rolling = await prisma.rolling.findUnique({ where: { id: rollingId } });
  if (!rolling) throw new HttpError(404, "Roulement introuvable.");
  if (rolling.budgetId) throw new HttpError(400, "Ce roulement a un budgétaire d'origine — le prix est gelé depuis la conversion.");

  await prisma.$transaction(async (tx) => {
    await tx.rolling.update({ where: { id: rollingId }, data: { sold } });
    if (sold > 0) {
      const existingPlan = await tx.invoicePlanEntry.count({ where: { rollingId } });
      if (existingPlan === 0) await createSinglePaymentPlan(tx, rollingId, sold);
    }
  });
}

/** "Consulter les heures" du menu Options — même mécanisme exact que getApprovedTimeEntries (projects/service.ts), adapté à rollingId. */
export async function getApprovedRollingTimeEntries(rollingId: string, showFinancials: boolean): Promise<ApprovedTimeEntryDto[]> {
  const entries = await prisma.timeEntry.findMany({
    where: { rollingId, status: "approved", deletedAt: null },
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

/** Menu Options du roulement (28 août 2026) — même mécanisme exact que setProjectArchived. */
export async function setRollingArchived(rollingId: string, archived: boolean): Promise<void> {
  const rolling = await prisma.rolling.findUnique({ where: { id: rollingId } });
  if (!rolling) throw new HttpError(404, "Roulement introuvable.");
  await prisma.rolling.update({ where: { id: rollingId }, data: { archivedAt: archived ? new Date() : null } });
}

/** Corbeille — mécanisme seulement (deletedAt, masqué des listes actives), même patron que deleteProject. */
export async function deleteRolling(rollingId: string): Promise<void> {
  const rolling = await prisma.rolling.findUnique({ where: { id: rollingId } });
  if (!rolling) throw new HttpError(404, "Roulement introuvable.");
  if (rolling.deletedAt) throw new HttpError(400, "Ce roulement est déjà dans la corbeille.");
  await prisma.rolling.update({ where: { id: rollingId }, data: { deletedAt: new Date() } });
}

export async function getRollingInvoicePlan(rollingId: string): Promise<InvoicePlanEntryDto[]> {
  const rows = await prisma.invoicePlanEntry.findMany({ where: { rollingId }, orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }] });
  return rows.map(toInvoicePlanEntryDto);
}

export async function markRollingProductionComplete(rollingId: string): Promise<void> {
  const rolling = await prisma.rolling.findUnique({ where: { id: rollingId } });
  if (!rolling) throw new HttpError(404, "Roulement introuvable.");
  if (rolling.productionCompleted) throw new HttpError(400, "La production est déjà marquée complétée.");
  await prisma.rolling.update({ where: { id: rollingId }, data: { productionCompleted: true } });
}

/** fulfillment.ts lance des Error ordinaires — reconverties ici en HttpError, même patron que projects/service.ts. */
function runFulfillmentStep<T>(fn: () => T): T {
  try {
    return fn();
  } catch (err) {
    throw new HttpError(400, err instanceof Error ? err.message : "Erreur de validation.");
  }
}

export interface ChooseRollingFulfillmentInput {
  mode: RollingFulfillmentMode;
  driverId?: string | null;
  address?: string;
  scheduled?: string | null;
}

export async function chooseRollingFulfillmentMode(rollingId: string, input: ChooseRollingFulfillmentInput): Promise<void> {
  const rolling = await prisma.rolling.findUnique({ where: { id: rollingId } });
  if (!rolling) throw new HttpError(404, "Roulement introuvable.");
  if (rolling.fulfillmentMode) throw new HttpError(400, "Le mode de sortie est déjà choisi pour ce roulement.");

  const updated = runFulfillmentStep(() =>
    chooseFulfillmentPure(
      { productionCompleted: rolling.productionCompleted, fulfillmentMode: (rolling.fulfillmentMode ?? undefined) as FulfillmentMode | undefined, status: rolling.status },
      input.mode,
      { driverId: input.driverId ?? null, address: input.address ?? "", scheduled: input.scheduled ?? null },
    ),
  );

  await prisma.$transaction(async (tx) => {
    await tx.rolling.update({
      where: { id: rollingId },
      data: {
        fulfillmentMode: updated.fulfillmentMode,
        fulfillmentScheduled: updated.fulfillmentScheduled ? new Date(updated.fulfillmentScheduled) : null,
        fulfillmentDriverId: updated.fulfillmentDriver,
        fulfillmentAddress: updated.fulfillmentAddress,
        fulfillmentStatus: updated.fulfillmentStatus,
      },
    });

    if (input.mode === FULFILLMENT_MODES.WAREHOUSE) {
      const settings = await tx.settings.findFirst();
      if (!settings) throw new HttpError(500, "Paramètres non initialisés — lancer le seed.");
      const displayId = `BL-${new Date().getFullYear()}-${String(settings.nextDeliveryNumber).padStart(4, "0")}`;
      await tx.delivery.create({
        data: {
          displayId,
          type: "rolling",
          rollingId,
          contactId: rolling.contactId,
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

/** Confirmer un mode tiers/ramassage — jamais pour warehouse (confirmé côté magasinier, module Livraisons). */
export async function confirmRollingFulfillment(rollingId: string, note?: string): Promise<void> {
  const rolling = await prisma.rolling.findUnique({ where: { id: rollingId } });
  if (!rolling) throw new HttpError(404, "Roulement introuvable.");

  const updated = runFulfillmentStep(() =>
    confirmFulfillmentPure(
      {
        fulfillmentMode: (rolling.fulfillmentMode ?? undefined) as FulfillmentMode | undefined,
        billingReady: rolling.billingReady,
        fulfillmentStatus: rolling.fulfillmentStatus ?? undefined,
        status: rolling.status,
      },
      note ?? "",
    ),
  );

  await prisma.rolling.update({
    where: { id: rollingId },
    data: {
      billingReady: updated.billingReady,
      fulfillmentStatus: updated.fulfillmentStatus,
      fulfillmentConfirmationNote: updated.fulfillmentConfirmationNote,
      status: updated.status,
    },
  });
}

export interface RollingPostMortemDto {
  id: string;
  contactName: string;
  company: string | null;
  sold?: number;
  postMortemDepassements: string | null;
  postMortemAmeliorations: string | null;
  postMortemRecommandation: string | null;
}

/**
 * Post-mortem (spec confirmée : « la livraison termine le roulement →
 * statut "Terminé" → apparaît au Post-mortem »). Volontairement SANS
 * comparatif/coût réel contrairement à getPostMortem (projects/service.ts)
 * — aucune donnée d'heures/achats n'existe pour un roulement, seul le
 * revenu est réel ici.
 */
export async function getRollingPostMortem(id: string, viewerPersona: Persona): Promise<RollingPostMortemDto> {
  const rolling = await prisma.rolling.findUnique({ where: { id }, include: { contact: { select: { name: true, company: true } } } });
  if (!rolling) throw new HttpError(404, "Roulement introuvable.");
  return {
    id: rolling.id,
    contactName: rolling.contact.name,
    company: rolling.contact.company,
    postMortemDepassements: rolling.postMortemDepassements,
    postMortemAmeliorations: rolling.postMortemAmeliorations,
    postMortemRecommandation: rolling.postMortemRecommandation,
    ...(canSeeFinancialValues(viewerPersona) && { sold: Number(rolling.sold) }),
  };
}

export interface UpdateRollingPostMortemInput {
  depassements?: string;
  ameliorations?: string;
  recommandation?: string;
}

export async function updateRollingPostMortemAnalysis(rollingId: string, input: UpdateRollingPostMortemInput): Promise<void> {
  const rolling = await prisma.rolling.findUnique({ where: { id: rollingId } });
  if (!rolling) throw new HttpError(404, "Roulement introuvable.");
  await prisma.rolling.update({
    where: { id: rollingId },
    data: {
      ...(input.depassements !== undefined && { postMortemDepassements: input.depassements || null }),
      ...(input.ameliorations !== undefined && { postMortemAmeliorations: input.ameliorations || null }),
      ...(input.recommandation !== undefined && { postMortemRecommandation: input.recommandation || null }),
    },
  });
}
