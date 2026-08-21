import { apiFetch } from "../../lib/apiClient.js";

export interface ProductionTaskDto {
  id: string;
  projectId: string;
  projectNumber: string;
  projectName: string;
  name: string;
  category: string;
  subcategory: string | null;
  skill: string | null;
  plannedHours: number;
  assignedEmployeeId: string | null;
  assignedEmployeeName: string | null;
  ganttCompleted: boolean;
  blockedByNames: string[];
}

export function fetchProductionTasks(): Promise<{ tasks: ProductionTaskDto[] }> {
  return apiFetch("/api/gantt/tasks");
}

export function assignProductionTask(id: string, employeeId: string | null): Promise<void> {
  return apiFetch(`/api/gantt/tasks/${id}/assignment`, { method: "PATCH", body: JSON.stringify({ employeeId }) });
}

export function setProductionTaskCompleted(id: string, completed: boolean): Promise<void> {
  return apiFetch(`/api/gantt/tasks/${id}/completed`, { method: "PATCH", body: JSON.stringify({ completed }) });
}
