import { apiFetch } from "../../lib/apiClient.js";

export type PunchProjectType = "project" | "service" | "internal";
export type RateType = "regular" | "overtime" | "extra";

export const RATE_TYPE_LABELS: Record<RateType, string> = {
  regular: "Régulier",
  overtime: "Temps supplémentaire",
  extra: "Extra",
};

export interface PunchableTaskDto {
  id: string;
  category: string;
  categoryLabel: string;
  label: string;
  scope: "project" | "internal" | "service";
}

export interface ProjectOptionDto {
  id: string;
  label: string;
}

export interface ServiceCallOptionDto {
  id: string;
  label: string;
}

export interface PunchableEmployeeDto {
  id: string;
  name: string;
  techLevelIds: string[];
}

export interface TimeEntryDto {
  id: string;
  date: string;
  employeeId: string;
  employeeName: string;
  projectType: PunchProjectType;
  projectId: string | null;
  projectLabel: string | null;
  serviceCallId: string | null;
  category: string;
  categoryLabel: string;
  taskId: string | null;
  taskLabel: string | null;
  startAt: string;
  endAt: string | null;
  exactMinutes: number | null;
  roundedMinutes: number | null;
  note: string | null;
  status: string;
  locked: boolean;
  techLevelId: string | null;
  techLevelLabel: string | null;
  rateType: RateType | null;
  blockageNote: string | null;
  costRate?: number;
}

export function fetchPunchableTasks(): Promise<{ tasks: PunchableTaskDto[] }> {
  return apiFetch("/api/punchable-tasks");
}

export function fetchProjectOptions(): Promise<{ projects: ProjectOptionDto[] }> {
  return apiFetch("/api/time-entries/project-options");
}

export function fetchServiceCallOptions(): Promise<{ serviceCalls: ServiceCallOptionDto[] }> {
  return apiFetch("/api/time-entries/service-call-options");
}

export function fetchPunchableEmployees(): Promise<{ employees: PunchableEmployeeDto[] }> {
  return apiFetch("/api/time-entries/employees");
}

export function fetchMyTimeEntries(): Promise<{ timeEntries: TimeEntryDto[] }> {
  return apiFetch("/api/time-entries/mine");
}

export function fetchTimeEntriesForApproval(): Promise<{ timeEntries: TimeEntryDto[] }> {
  return apiFetch("/api/time-entries/for-approval");
}

export function fetchAllTimeEntries(): Promise<{ timeEntries: TimeEntryDto[] }> {
  return apiFetch("/api/time-entries/all");
}

export interface PunchReferenceInput {
  employeeId?: string;
  projectType: PunchProjectType;
  projectId?: string;
  serviceCallId?: string;
  taskId: string;
  techLevelId?: string;
  rateType?: RateType;
}

export function startTimer(input: PunchReferenceInput & { note?: string }): Promise<{ timeEntry: TimeEntryDto }> {
  return apiFetch("/api/time-entries/start", { method: "POST", body: JSON.stringify(input) });
}

export function stopTimer(id: string): Promise<{ timeEntry: TimeEntryDto }> {
  return apiFetch(`/api/time-entries/${id}/stop`, { method: "POST" });
}

export interface ManualEntryInput extends PunchReferenceInput {
  date: string;
  hours: number;
  note?: string;
  blockageNote?: string;
}

export function createManualEntry(input: ManualEntryInput): Promise<{ timeEntry: TimeEntryDto }> {
  return apiFetch("/api/time-entries", { method: "POST", body: JSON.stringify(input) });
}

export function approveTimeEntry(id: string): Promise<{ timeEntry: TimeEntryDto }> {
  return apiFetch(`/api/time-entries/${id}/approve`, { method: "POST" });
}

export interface UpdateTimeEntryInput {
  note?: string;
  blockageNote?: string | null;
  projectType?: PunchProjectType;
  projectId?: string;
  serviceCallId?: string;
  taskId?: string;
  hours?: number;
  justification?: string;
}

export function updateTimeEntry(id: string, patch: UpdateTimeEntryInput): Promise<{ timeEntry: TimeEntryDto }> {
  return apiFetch(`/api/time-entries/${id}`, { method: "PATCH", body: JSON.stringify(patch) });
}
