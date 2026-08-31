import { apiFetch } from "../../lib/apiClient.js";

export type GanttOwnerType = "project" | "rolling";

export interface GanttScheduledTaskDto {
  id: string;
  ownerType: GanttOwnerType;
  ownerId: string;
  ownerLabel: string;
  name: string;
  category: string;
  categoryLabel: string;
  subcategory: string | null;
  skill: string | null;
  plannedHours: number;
  remainingHours: number;
  pinnedEmployeeId: string | null;
  pinnedEmployeeName: string | null;
  priority: number;
  deadline: string | null;
  desiredStart: string | null;
  dependsOnIds: string[];
  allocations: { date: string; employeeId: string; employeeName: string; rawHours: number; effectiveHours: number }[];
  firstScheduledDate: string | null;
  predictedCompletedDate: string | null;
}

export interface GanttScheduleDto {
  horizonDays: string[];
  tasks: GanttScheduledTaskDto[];
  unscheduled: GanttScheduledTaskDto[];
  completed: GanttScheduledTaskDto[];
  capacityByEmployeeDate: Record<string, Record<string, { base: number; available: number; employeeName: string }>>;
  employees: { id: string; name: string }[];
}

export function fetchGanttSchedule(): Promise<{ schedule: GanttScheduleDto }> {
  return apiFetch("/api/gantt/schedule");
}

export function assignProductionTask(id: string, employeeId: string | null): Promise<void> {
  return apiFetch(`/api/gantt/tasks/${id}/assignment`, { method: "PATCH", body: JSON.stringify({ employeeId }) });
}

export function setProductionTaskCompleted(id: string, completed: boolean): Promise<void> {
  return apiFetch(`/api/gantt/tasks/${id}/completed`, { method: "PATCH", body: JSON.stringify({ completed }) });
}

export interface GanttReadyRollingDto {
  ownerType: "rolling";
  id: string;
  rollingNumber: string;
  contactName: string;
  priority: number;
  dueDate: string | null;
}

export interface GanttReadyProjectBatchDto {
  ownerType: "project_batch";
  id: string;
  batchKind: "subassembly" | "amendment";
  projectId: string;
  projectNumber: string;
  projectName: string;
  projectPriority: number;
  batchLabel: string;
  taskCount: number;
  totalPlannedHours: number;
}

export interface GanttReadyQueueDto {
  rollings: GanttReadyRollingDto[];
  projectBatches: GanttReadyProjectBatchDto[];
}

export function fetchGanttReadyQueue(): Promise<{ queue: GanttReadyQueueDto }> {
  return apiFetch("/api/gantt/ready-queue");
}

export interface GanttPreviewInput {
  ownerType: GanttOwnerType;
  ownerId: string;
  batchId?: string;
  hoursByCategory?: Record<string, number>;
  priority?: number;
}

export interface GanttPreviewDto {
  schedule: GanttScheduleDto;
  candidateTaskIds: string[];
}

export function previewGanttEntry(input: GanttPreviewInput): Promise<{ preview: GanttPreviewDto }> {
  return apiFetch("/api/gantt/preview", { method: "POST", body: JSON.stringify(input) });
}

export function updateProjectGanttPriority(projectId: string, priority: number): Promise<void> {
  return apiFetch(`/api/projects/${projectId}/gantt-priority`, { method: "PATCH", body: JSON.stringify({ priority }) });
}

export function enterProjectGanttBatch(projectId: string, body: { scope: "batch" | "whole_project"; batchId?: string }): Promise<void> {
  return apiFetch(`/api/projects/${projectId}/enter-gantt`, { method: "POST", body: JSON.stringify(body) });
}

export function updateRollingGanttPlanning(rollingId: string, body: { priority?: number; dueDate?: string | null }): Promise<void> {
  return apiFetch(`/api/rollings/${rollingId}/gantt-priority`, { method: "PATCH", body: JSON.stringify(body) });
}

export function activateRollingGantt(rollingId: string, hoursByCategory: Record<string, number>): Promise<void> {
  return apiFetch(`/api/rollings/${rollingId}/enter-gantt`, { method: "POST", body: JSON.stringify({ hoursByCategory }) });
}
