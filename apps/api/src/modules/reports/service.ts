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
 * Roulements : aucun coût/heures réelles n'existe nulle part pour cette
 * entité (module Roulements pas encore construit — TimeEntry et
 * PurchaseRequest n'ont même pas de rollingId au schéma) — seul le revenu
 * (sold) est donc affiché, jamais une marge fabriquée à partir d'un coût à
 * 0 (ça afficherait 100 % de marge, faux).
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
    prisma.rolling.findMany({ include: { contact: { select: { name: true, company: true } } }, orderBy: { createdAt: "desc" } }),
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

  const rollingRows: ProfitabilityRowDto[] = rollings.map((rolling) => ({
    id: rolling.id,
    type: "rolling",
    typeLabel: "Roulement",
    displayId: "—",
    label: rolling.contact.company ?? rolling.contact.name,
    clientLabel: rolling.contact.company ?? rolling.contact.name,
    revenue: Number(rolling.sold),
    cost: null,
    grossMargin: null,
    grossMarginPct: null,
    financialStatus: null,
    actualHours: null,
  }));

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
      label: call.request,
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

export interface InternalHoursEmployeeDto {
  employeeId: string;
  employeeName: string;
  hours: number;
  value: number;
  count: number;
}

export interface InternalStatsDto {
  year: number;
  availableYears: number[];
  hours: { employees: InternalHoursEmployeeDto[]; hours: number; value: number };
  purchases: ReturnType<typeof internalPurchasesSummary>;
}

/**
 * Statistiques Interne (« Amélioration GSC ») — reprend internalHoursSummary/
 * internalPurchasesSummary telles quelles (internal-stats.ts, jamais
 * modifiées), heures et achats gardés séparés comme confirmé le 8 août
 * 2026. availableYears dérivé des dates réelles trouvées (jamais deviné) —
 * l'année demandée est toujours incluse même si elle n'a encore aucune
 * donnée, pour que le sélecteur reste utilisable sur une année vide.
 */
export async function getInternalStats(year: number): Promise<InternalStatsDto> {
  const [timeEntries, purchaseRequests] = await Promise.all([
    prisma.timeEntry.findMany({
      where: { projectType: "internal", deletedAt: null },
      select: { employeeId: true, status: true, date: true, roundedMinutes: true, costRate: true },
    }),
    prisma.purchaseRequest.findMany({
      where: { projectType: "internal" },
      select: { status: true, requestedAt: true, amount: true, category: { select: { name: true } } },
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
    employee: entry.employeeId,
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

  const employeeIds = [...new Set(hoursSummary.employees.map((row) => row.employeeId))];
  const employees = await prisma.employee.findMany({ where: { id: { in: employeeIds } }, select: { id: true, name: true } });
  const nameById = new Map(employees.map((employee) => [employee.id, employee.name]));

  return {
    year,
    availableYears,
    hours: {
      employees: hoursSummary.employees.map((row) => ({ ...row, employeeName: nameById.get(row.employeeId) ?? "—" })),
      hours: hoursSummary.hours,
      value: hoursSummary.value,
    },
    purchases: purchasesSummary,
  };
}
