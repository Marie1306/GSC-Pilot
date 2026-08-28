import { apiFetch } from "../../lib/apiClient.js";

export { formatCurrency } from "../projects/api.js";

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
  hoursValue: number;
  note: string | null;
  createdById: string;
  createdByName: string;
  createdAt: string;
  photos: ErrorReportPhotoDto[];
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
  availableYears: number[];
}

export interface ErrorReportStatsDto {
  totalMaterialValue: number;
  totalHoursLost: number;
  totalHoursValue: number;
  reportCount: number;
  availableYears: number[];
}

export interface ErrorReportSubjectDto {
  id: string;
  name: string;
  costRate: number;
}

export interface ErrorReportFilters {
  month?: number;
  year?: number;
}

function toQuery(filters: ErrorReportFilters & { employeeId?: string } = {}): string {
  const params = new URLSearchParams();
  if (filters.month !== undefined) params.set("month", String(filters.month));
  if (filters.year !== undefined) params.set("year", String(filters.year));
  if (filters.employeeId) params.set("employeeId", filters.employeeId);
  const qs = params.toString();
  return qs ? `?${qs}` : "";
}

export function fetchErrorReportSubjects(): Promise<{ employees: ErrorReportSubjectDto[] }> {
  return apiFetch("/api/error-reports/subjects");
}

export function fetchErrorReportsByEmployee(filters: ErrorReportFilters = {}): Promise<ErrorReportsByEmployeeDto> {
  return apiFetch(`/api/error-reports/by-employee${toQuery(filters)}`);
}

export function fetchErrorReportsForEmployee(employeeId: string, filters: ErrorReportFilters = {}): Promise<{ reports: ErrorReportDto[] }> {
  return apiFetch(`/api/error-reports/by-employee/${employeeId}${toQuery(filters)}`);
}

export function fetchErrorReportsStats(filters: ErrorReportFilters & { employeeId?: string } = {}): Promise<ErrorReportStatsDto> {
  return apiFetch(`/api/error-reports/stats${toQuery(filters)}`);
}

export interface CreateErrorReportInput {
  employeeId: string;
  materialValue: number;
  hoursLost: number;
  note?: string;
  photos?: string[];
}

export function createErrorReport(input: CreateErrorReportInput): Promise<{ report: ErrorReportDto }> {
  return apiFetch("/api/error-reports", { method: "POST", body: JSON.stringify(input) });
}

export function deleteErrorReport(id: string): Promise<void> {
  return apiFetch(`/api/error-reports/${id}`, { method: "DELETE" });
}
