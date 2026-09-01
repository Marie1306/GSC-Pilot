/**
 * GSC Pilot — Rapports (20 août 2026)
 *
 * Confirmé (spécification, section « Rapports, Contacts, Tableau de bord,
 * notifications, QR ») : « tableau comparatif de rentabilité (revenu,
 * coût, marge, heures réelles) entre projets, roulements et calls de
 * service, plus un graphique de conversion par canal de vente. Agrège des
 * données déjà confirmées ailleurs — pas de nouvelle règle métier à
 * trancher. » Chaque chiffre ci-dessous reste calculé par les fonctions
 * déjà vérifiées (listProjects, getServiceCallDetail, projectMargin,
 * financialStatus, internalHoursSummary/internalPurchasesSummary) — jamais
 * un deuxième calcul divergent.
 *
 * Roulements (1er septembre 2026, demande de l'utilisatrice — même chiffres
 * réels que Projet et Call de service) : réutilise getRollingDetail
 * (rollings/service.ts, déjà exposée par le module Roulements) par
 * roulement, même patron que callDetails/getServiceCallDetail ci-dessous
 * plutôt qu'un agrégat batché comme listProjects — le nombre de roulements
 * reste faible, jamais un aller-retour DB coûteux en pratique. cost n'est
 * pas un champ direct de RollingDetailDto : dérivé de sold − grossMargin
 * (projectMargin, margin.ts : grossMargin = sold − laborCost − purchases),
 * jamais un deuxième calcul divergent.
 *
 * Cette vue n'est atteignable que par canAccessOverviewViews (Direction/
 * Administration/Propriétaire) — exactement le même ensemble de rôles que
 * canSeeFinancialValues/canSeeServicePricing (roles.ts), donc les montants
 * sont toujours visibles ici, jamais vérifié au cas par cas comme ailleurs.
 */
import {
  projectMargin,
  financialStatus,
  internalHoursSummary,
  internalPurchasesSummary,
  type FinancialStatus,
  type Persona,
  type InternalTimeEntry,
  type InternalPurchase,
} from "@gsc-pilot/business-rules";
import { prisma } from "../../db.js";
import { HttpError } from "../../middleware/errorHandler.js";
import { listProjects } from "../projects/service.js";
import { listRollings, getRollingDetail } from "../rollings/service.js";
import { listServiceCalls, getServiceCallDetail } from "../serviceCalls/service.js";

function round2(value: number): number {
  return Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100;
}

export interface ProfitabilityRowDto {
  id: string;
  type: "project" | "rolling" | "service_call";
  typeLabel: string;
  displayId: string;
  label: string;
  clientLabel: string;
  revenue: number;
  cost: number | null;
  grossMargin: number | null;
  grossMarginPct: number | null;
  financialStatus: FinancialStatus | null;
  actualHours: number | null;
}

/**
 * viewerPersona est toujours Direction/Administration/Propriétaire ici
 * (canAccessOverviewViews, voir routes.ts) — showFinancials est donc
 * toujours vrai dans listProjects/getServiceCallDetail, jamais besoin de
 * vérifier au cas par cas comme dans le reste de l'application.
 */
export async function getProfitabilityReport(viewerPersona: Persona, viewerEmployeeId: string): Promise<ProfitabilityRowDto[]> {
  const settings = await prisma.settings.findFirst();
  if (!settings) throw new HttpError(500, "Paramètres non initialisés — lancer le seed.");
  const thresholds = {
    conformeThreshold: Number(settings.marginConformeThreshold),
    atRiskThreshold: Number(settings.marginAtRiskThreshold),
  };

  const [projects, rollings, callSummaries] = await Promise.all([
    listProjects(viewerPersona),
    listRollings(viewerPersona),
    listServiceCalls(viewerPersona, viewerEmployeeId),
  ]);

  const projectRows: ProfitabilityRowDto[] = projects.map((project) => ({
    id: project.id,
    type: "project",
    typeLabel: "Projet",
    displayId: project.projectNumber,
    label: project.name,
    clientLabel: project.company ?? project.contactName,
    revenue: project.sold ?? 0,
    cost: project.cost ?? null,
    grossMargin: project.grossMargin ?? null,
    grossMarginPct: project.grossMarginPct ?? null,
    financialStatus: project.financialStatus ?? null,
    actualHours: project.actualHours,
  }));

  // getRollingDetail (déjà exportée, déjà vérifiée) recalcule les mêmes
  // totaux que computeRollingFinancials — jamais un troisième calcul (même
  // raison que getServiceCallDetail ci-dessous pour les calls).
  const rollingDetails = await Promise.all(rollings.map((rolling) => getRollingDetail(rolling.id, viewerPersona)));
  const rollingRows: ProfitabilityRowDto[] = rollingDetails.map((rolling) => {
    const sold = rolling.sold ?? 0;
    return {
      id: rolling.id,
      type: "rolling",
      typeLabel: "Roulement",
      displayId: rolling.rollingNumber,
      label: rolling.company ?? rolling.contactName,
      clientLabel: rolling.company ?? rolling.contactName,
      revenue: sold,
      cost: rolling.grossMargin !== undefined ? round2(sold - rolling.grossMargin) : null,
      grossMargin: rolling.grossMargin ?? null,
      grossMarginPct: rolling.grossMarginPct ?? null,
      financialStatus: rolling.financialStatus ?? null,
      actualHours: rolling.actualHours,
    };
  });

  // getServiceCallDetail (déjà exporté, déjà vérifié) recalcule les mêmes
  // totaux que computeServiceCallFinancials — jamais un troisième calcul.
  const callDetails = await Promise.all(callSummaries.map((call) => getServiceCallDetail(call.id, viewerPersona)));
  const callRows: ProfitabilityRowDto[] = callDetails.map((call) => {
    const revenue = call.totals.totalSale ?? 0;
    const cost = call.totals.totalCost ?? 0;
    const margin = projectMargin(revenue, cost, 0);
    return {
      id: call.id,
      type: "service_call",
      typeLabel: "Call de service",
      displayId: call.displayId,
      label: call.title,
      clientLabel: call.company ?? call.contactName,
      revenue,
      cost,
      grossMargin: margin.grossMargin,
      grossMarginPct: round2(margin.grossMarginPct),
      financialStatus: financialStatus(margin.grossMarginPct, thresholds),
      actualHours: call.totals.laborHours,
    };
  });

  return [...projectRows, ...rollingRows, ...callRows].sort((a, b) => b.revenue - a.revenue);
}

export interface ChannelConversionDto {
  salesChannelId: string;
  name: string;
  total: number;
  converted: number;
  conversionPct: number;
}

/**
 * « Graphique de conversion par canal de vente » — tous les canaux, même
 * désactivés depuis (l'historique de conversion ne doit pas disparaître
 * juste parce que Direction a désactivé un canal, contrairement au menu
 * déroulant du formulaire de demande — /client-requests/sales-channels —
 * qui ne montre que les canaux actifs). "converted" = ClientRequest.status
 * === "converted", le seul signal de conversion qui existe (voir
 * budgets/service.ts : posé quand un budgétaire est créé pour la demande
 * — pas nécessairement "contrat obtenu", juste "un budgétaire existe").
 */
export async function getChannelConversion(): Promise<ChannelConversionDto[]> {
  const [channels, requests] = await Promise.all([
    prisma.salesChannel.findMany({ orderBy: { sortOrder: "asc" } }),
    prisma.clientRequest.findMany({ where: { deletedAt: null }, select: { salesChannelId: true, status: true } }),
  ]);

  const countsByChannel = new Map<string, { total: number; converted: number }>();
  for (const request of requests) {
    if (!request.salesChannelId) continue;
    const current = countsByChannel.get(request.salesChannelId) ?? { total: 0, converted: 0 };
    current.total += 1;
    if (request.status === "converted") current.converted += 1;
    countsByChannel.set(request.salesChannelId, current);
  }

  return channels.map((channel) => {
    const counts = countsByChannel.get(channel.id) ?? { total: 0, converted: 0 };
    return {
      salesChannelId: channel.id,
      name: channel.name,
      total: counts.total,
      converted: counts.converted,
      conversionPct: counts.total > 0 ? round2((counts.converted / counts.total) * 100) : 0,
    };
  });
}

export interface InternalHoursTaskDto {
  taskId: string;
  taskLabel: string;
  hours: number;
  value: number;
  count: number;
}

export interface InternalHoursDetailDto {
  id: string;
  date: string;
  employeeName: string;
  taskLabel: string;
  hours: number;
  value: number;
}

export interface InternalPurchaseDetailDto {
  id: string;
  requestedAt: string;
  supplier: string | null;
  categoryName: string;
  amount: number;
}

export interface InternalStatsDto {
  year: number;
  availableYears: number[];
  hours: { tasks: InternalHoursTaskDto[]; hours: number; value: number; detail: InternalHoursDetailDto[] };
  purchases: ReturnType<typeof internalPurchasesSummary> & { detail: InternalPurchaseDetailDto[] };
}

/**
 * Statistiques Interne (« Amélioration GSC ») — reprend internalHoursSummary/
 * internalPurchasesSummary telles quelles (internal-stats.ts, jamais
 * modifiées), heures et achats gardés séparés comme confirmé le 8 août
 * 2026. availableYears dérivé des dates réelles trouvées (jamais deviné) —
 * l'année demandée est toujours incluse même si elle n'a encore aucune
 * donnée, pour que le sélecteur reste utilisable sur une année vide.
 *
 * Regroupement par TÂCHE plutôt que par employé (25 août 2026, demande
 * explicite) : internalHoursSummary groupe par le champ générique `employee`
 * (une simple clé de regroupement, jamais validée contre de vrais IDs
 * employé — voir internal-stats.ts) — réutilisée telle quelle en y glissant
 * taskId à la place, exactement comme actualHoursByCategory est réutilisée
 * pour un regroupement par tâche ailleurs (ProjectPostMortem). Les tâches
 * restent celles gérées dans Paramètres → Tâches punchables (PunchableTask),
 * aucun nouveau catalogue.
 */
export async function getInternalStats(year: number): Promise<InternalStatsDto> {
  const [timeEntries, purchaseRequests] = await Promise.all([
    prisma.timeEntry.findMany({
      where: { projectType: "internal", deletedAt: null },
      select: { id: true, employeeId: true, taskId: true, status: true, date: true, roundedMinutes: true, costRate: true },
    }),
    prisma.purchaseRequest.findMany({
      where: { projectType: "internal" },
      select: { id: true, status: true, requestedAt: true, amount: true, supplier: true, category: { select: { name: true } } },
    }),
  ]);

  const availableYears = [
    ...new Set([
      ...timeEntries.map((entry) => entry.date.getUTCFullYear()),
      ...purchaseRequests.map((request) => request.requestedAt.getUTCFullYear()),
    ]),
  ].sort((a, b) => b - a);
  if (!availableYears.includes(year)) availableYears.unshift(year);

  const hoursInput: InternalTimeEntry[] = timeEntries.map((entry) => ({
    employee: entry.taskId ?? "—",
    projectType: "internal",
    status: entry.status,
    date: entry.date.toISOString(),
    roundedMinutes: entry.roundedMinutes ?? 0,
    costRate: Number(entry.costRate),
  }));
  const purchasesInput: InternalPurchase[] = purchaseRequests.map((request) => ({
    projectType: "internal",
    status: request.status,
    requestedAt: request.requestedAt.toISOString(),
    amount: request.amount !== null ? Number(request.amount) : 0,
    category: request.category?.name ?? "Sans catégorie",
  }));

  const hoursSummary = internalHoursSummary(hoursInput, year);
  const purchasesSummary = internalPurchasesSummary(purchasesInput, year);

  const taskIds = [...new Set(hoursSummary.employees.map((row) => row.employeeId))];
  const employeeIds = [...new Set(timeEntries.map((entry) => entry.employeeId))];
  const [tasks, employees] = await Promise.all([
    prisma.punchableTask.findMany({ where: { id: { in: taskIds } }, select: { id: true, label: true } }),
    prisma.employee.findMany({ where: { id: { in: employeeIds } }, select: { id: true, name: true } }),
  ]);
  const taskLabelById = new Map(tasks.map((task) => [task.id, task.label]));
  const employeeNameById = new Map(employees.map((employee) => [employee.id, employee.name]));

  const approvedYearEntries = timeEntries.filter(
    (entry) => entry.status === "approved" && entry.date.getUTCFullYear() === year,
  );
  const purchaseYearEntries = purchaseRequests.filter(
    (request) => ["approved", "authorized"].includes(request.status) && request.requestedAt.getUTCFullYear() === year,
  );

  return {
    year,
    availableYears,
    hours: {
      tasks: hoursSummary.employees.map((row) => ({
        taskId: row.employeeId,
        taskLabel: taskLabelById.get(row.employeeId) ?? "—",
        hours: row.hours,
        value: row.value,
        count: row.count,
      })),
      hours: hoursSummary.hours,
      value: hoursSummary.value,
      detail: approvedYearEntries.map((entry) => ({
        id: entry.id,
        date: entry.date.toISOString(),
        employeeName: employeeNameById.get(entry.employeeId) ?? "—",
        taskLabel: entry.taskId ? (taskLabelById.get(entry.taskId) ?? "—") : "—",
        hours: round2((entry.roundedMinutes ?? 0) / 60),
        value: round2(((entry.roundedMinutes ?? 0) / 60) * Number(entry.costRate)),
      })),
    },
    purchases: {
      ...purchasesSummary,
      detail: purchaseYearEntries.map((request) => ({
        id: request.id,
        requestedAt: request.requestedAt.toISOString(),
        supplier: request.supplier,
        categoryName: request.category?.name ?? "Sans catégorie",
        amount: request.amount !== null ? Number(request.amount) : 0,
      })),
    },
  };
}
