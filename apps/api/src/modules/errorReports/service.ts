/**
 * GSC Pilot — Rapport d'erreurs (28 août 2026, nouveau module)
 *
 * Accessible Propriétaire et Direction seulement (canAccessErrorReports,
 * roles.ts) — un seul palier pour tout le module, voir ce fichier. L'employé
 * "visé" par un rapport doit être Employé ou Magasinier
 * (canBeErrorReportSubject) — validé ici, jamais fait confiance à l'appelant.
 *
 * Filtrage mois/année fait en mémoire après une seule requête (même
 * principe que getInternalStats, reports/service.ts) — volume attendu bas
 * pour ce module (rapports d'incidents, pas des milliers de lignes), inutile
 * de complexifier la requête Prisma avec des bornes de date.
 */
import { ROLES, canBeErrorReportSubject } from "@gsc-pilot/business-rules";
import { prisma } from "../../db.js";
import { HttpError } from "../../middleware/errorHandler.js";
import type { Prisma } from "../../generated/prisma/client.js";

function round2(value: number): number {
  return Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100;
}

interface DateFilters {
  month?: number;
  year?: number;
}

function matchesFilter(date: Date, filters: DateFilters): boolean {
  if (filters.year !== undefined && date.getUTCFullYear() !== filters.year) return false;
  if (filters.month !== undefined && date.getUTCMonth() + 1 !== filters.month) return false;
  return true;
}

export interface CreateErrorReportInput {
  employeeId: string;
  materialValue: number;
  hoursLost: number;
  note?: string;
  /** Data URLs base64 (voir schema.prisma, en-tête du modèle ErrorReport). */
  photos?: string[];
}

export interface ErrorReportPhotoDto {
  id: string;
  imageDataUrl: string;
  uploadedAt: string;
}

export interface ErrorReportDto {
  id: string;
  employeeId: string;
  employeeName: string;
  materialValue: number;
  hoursLost: number;
  hourlyRateSnapshot: number;
  /** Toujours calculé (hoursLost × hourlyRateSnapshot) — jamais une colonne séparée, voir schema.prisma. */
  hoursValue: number;
  note: string | null;
  createdById: string;
  createdByName: string;
  createdAt: string;
  photos: ErrorReportPhotoDto[];
}

type ErrorReportRow = {
  id: string;
  employeeId: string;
  employee: { name: string };
  materialValue: Prisma.Decimal;
  hoursLost: Prisma.Decimal;
  hourlyRateSnapshot: Prisma.Decimal;
  note: string | null;
  createdById: string;
  createdBy: { name: string };
  createdAt: Date;
  photos: { id: string; imageDataUrl: string; uploadedAt: Date }[];
};

function toDto(report: ErrorReportRow): ErrorReportDto {
  const hoursLost = Number(report.hoursLost);
  const hourlyRateSnapshot = Number(report.hourlyRateSnapshot);
  return {
    id: report.id,
    employeeId: report.employeeId,
    employeeName: report.employee.name,
    materialValue: Number(report.materialValue),
    hoursLost,
    hourlyRateSnapshot,
    hoursValue: round2(hoursLost * hourlyRateSnapshot),
    note: report.note,
    createdById: report.createdById,
    createdByName: report.createdBy.name,
    createdAt: report.createdAt.toISOString(),
    photos: report.photos.map((photo) => ({ id: photo.id, imageDataUrl: photo.imageDataUrl, uploadedAt: photo.uploadedAt.toISOString() })),
  };
}

const REPORT_INCLUDE = { employee: true, createdBy: true, photos: true } satisfies Prisma.ErrorReportInclude;

export async function createErrorReport(createdById: string, input: CreateErrorReportInput): Promise<ErrorReportDto> {
  const employee = await prisma.employee.findUnique({ where: { id: input.employeeId } });
  if (!employee) throw new HttpError(404, "Employé introuvable.");
  if (!canBeErrorReportSubject(employee.persona)) {
    throw new HttpError(400, "Seuls les employés ou magasiniers peuvent être visés par un rapport d'erreur.");
  }
  const materialValue = Math.max(0, Number(input.materialValue) || 0);
  const hoursLost = Math.max(0, Number(input.hoursLost) || 0);
  if (materialValue <= 0 && hoursLost <= 0) {
    throw new HttpError(400, "Le rapport doit indiquer une valeur matérielle ou des heures perdues.");
  }
  for (const photo of input.photos ?? []) {
    if (!photo.startsWith("data:image/")) throw new HttpError(400, "Photo invalide.");
  }

  const report = await prisma.errorReport.create({
    data: {
      employeeId: input.employeeId,
      materialValue,
      hoursLost,
      hourlyRateSnapshot: employee.costRate,
      note: input.note?.trim() || null,
      createdById,
      photos: input.photos?.length ? { create: input.photos.map((imageDataUrl) => ({ imageDataUrl })) } : undefined,
    },
    include: REPORT_INCLUDE,
  });
  return toDto(report);
}

export async function getErrorReportDetail(id: string): Promise<ErrorReportDto> {
  const report = await prisma.errorReport.findFirst({ where: { id, deletedAt: null }, include: REPORT_INCLUDE });
  if (!report) throw new HttpError(404, "Rapport d'erreur introuvable.");
  return toDto(report);
}

export interface ErrorReportEmployeeSummaryDto {
  employeeId: string;
  employeeName: string;
  reportCount: number;
  totalMaterialValue: number;
  totalHoursLost: number;
  totalHoursValue: number;
}

export interface ErrorReportsByEmployeeDto {
  summaries: ErrorReportEmployeeSummaryDto[];
  /** Dérivé des dates réelles trouvées (même principe que getInternalStats, reports/service.ts) — jamais deviné. */
  availableYears: number[];
}

/** Page principale du module — groupée par employé (spec confirmée : « diviser par employé »), filtrable mois/année. */
export async function getErrorReportsByEmployee(filters: DateFilters = {}): Promise<ErrorReportsByEmployeeDto> {
  const reports = await prisma.errorReport.findMany({
    where: { deletedAt: null },
    include: { employee: { select: { name: true } } },
  });
  const availableYears = [...new Set(reports.map((report) => report.createdAt.getUTCFullYear()))].sort((a, b) => b - a);
  const filtered = reports.filter((report) => matchesFilter(report.createdAt, filters));

  const byEmployee = new Map<string, ErrorReportEmployeeSummaryDto>();
  for (const report of filtered) {
    const current = byEmployee.get(report.employeeId) ?? {
      employeeId: report.employeeId,
      employeeName: report.employee.name,
      reportCount: 0,
      totalMaterialValue: 0,
      totalHoursLost: 0,
      totalHoursValue: 0,
    };
    current.reportCount += 1;
    current.totalMaterialValue += Number(report.materialValue);
    current.totalHoursLost += Number(report.hoursLost);
    current.totalHoursValue += Number(report.hoursLost) * Number(report.hourlyRateSnapshot);
    byEmployee.set(report.employeeId, current);
  }

  const summaries = [...byEmployee.values()]
    .map((row) => ({
      ...row,
      totalMaterialValue: round2(row.totalMaterialValue),
      totalHoursLost: round2(row.totalHoursLost),
      totalHoursValue: round2(row.totalHoursValue),
    }))
    .sort((a, b) => a.employeeName.localeCompare(b.employeeName));

  return { summaries, availableYears };
}

/** Drill-down (« ouvrir le détail de tous les rapports d'erreurs » d'un employé), filtrable mois/année. */
export async function listErrorReportsForEmployee(employeeId: string, filters: DateFilters = {}): Promise<ErrorReportDto[]> {
  const reports = await prisma.errorReport.findMany({
    where: { employeeId, deletedAt: null },
    include: REPORT_INCLUDE,
    orderBy: { createdAt: "desc" },
  });
  return reports.filter((report) => matchesFilter(report.createdAt, filters)).map(toDto);
}

export interface ErrorReportStatsDto {
  totalMaterialValue: number;
  totalHoursLost: number;
  totalHoursValue: number;
  reportCount: number;
  availableYears: number[];
}

/** Section « Rapports d'erreurs » de Rapports et statistiques — agrégat filtrable mois/année/employé. */
export async function getErrorReportsStats(filters: DateFilters & { employeeId?: string } = {}): Promise<ErrorReportStatsDto> {
  const reports = await prisma.errorReport.findMany({
    where: { deletedAt: null, ...(filters.employeeId ? { employeeId: filters.employeeId } : {}) },
    select: { createdAt: true, materialValue: true, hoursLost: true, hourlyRateSnapshot: true },
  });

  const availableYears = [...new Set(reports.map((report) => report.createdAt.getUTCFullYear()))].sort((a, b) => b - a);
  const filtered = reports.filter((report) => matchesFilter(report.createdAt, filters));
  const totals = filtered.reduce(
    (acc, report) => {
      acc.totalMaterialValue += Number(report.materialValue);
      acc.totalHoursLost += Number(report.hoursLost);
      acc.totalHoursValue += Number(report.hoursLost) * Number(report.hourlyRateSnapshot);
      acc.reportCount += 1;
      return acc;
    },
    { totalMaterialValue: 0, totalHoursLost: 0, totalHoursValue: 0, reportCount: 0 },
  );

  return {
    totalMaterialValue: round2(totals.totalMaterialValue),
    totalHoursLost: round2(totals.totalHoursLost),
    totalHoursValue: round2(totals.totalHoursValue),
    reportCount: totals.reportCount,
    availableYears,
  };
}

export interface ErrorReportSubjectDto {
  id: string;
  name: string;
  /** Exposé ici volontairement — cette route n'est jamais atteignable que par Propriétaire/Direction (canAccessErrorReports, sous-ensemble de canSeeFinancialValues), pour un aperçu en direct de la valeur des heures pendant la saisie du formulaire. */
  costRate: number;
}

/** Employés sélectionnables comme "visé" à la création — Employé/Magasinier actifs seulement (canBeErrorReportSubject). */
export async function listErrorReportSubjects(): Promise<ErrorReportSubjectDto[]> {
  const employees = await prisma.employee.findMany({
    where: { active: true, persona: { in: [ROLES.MEMBER, ROLES.WAREHOUSE] } },
    orderBy: { name: "asc" },
    select: { id: true, name: true, costRate: true },
  });
  return employees.map((employee) => ({ id: employee.id, name: employee.name, costRate: Number(employee.costRate) }));
}

/** Corbeille — Direction seulement (canDeleteErrorReport). Pas d'édition : un rapport d'erreur est un constat factuel (voir schema.prisma). */
export async function deleteErrorReport(id: string): Promise<void> {
  const report = await prisma.errorReport.findFirst({ where: { id, deletedAt: null } });
  if (!report) throw new HttpError(404, "Rapport d'erreur introuvable.");
  await prisma.errorReport.update({ where: { id }, data: { deletedAt: new Date() } });
}
