import { apiFetch } from "../../lib/apiClient.js";

export interface ChecklistDto {
  id: string;
  projectId: string;
  projectNumber: string;
  projectName: string;
  assemblyLabel: string | null;
  createdByName: string;
  createdAt: string;
}

export interface ChecklistItemStepDto {
  stepId: string;
  stepLabel: string;
  active: boolean;
  completed: boolean;
  completedByName: string | null;
  completedAt: string | null;
}

export interface ChecklistItemDto {
  id: string;
  checklistId: string;
  kind: "piece" | "subassembly";
  parentItemId: string | null;
  parentNumber: string | null;
  number: string;
  quantity: number | null;
  thickness: string | null;
  material: string | null;
  shapeType: string | null;
  tubeShape: string | null;
  tubeOD: string | null;
  tubeID: string | null;
  tubeMeasurement1: string | null;
  tubeMeasurement2: string | null;
  tubeWallThickness: string | null;
  shaftMeasurement: string | null;
  note: string | null;
  createdByName: string;
  createdAt: string;
  steps: ChecklistItemStepDto[];
}

export interface ChecklistWithItemsDto extends ChecklistDto {
  items: ChecklistItemDto[];
}

export interface ActiveChecklistItemDto extends ChecklistItemDto {
  projectNumber: string;
  projectName: string;
  assemblyLabel: string | null;
}

export function createChecklist(projectId: string, assemblyLabel?: string): Promise<{ checklist: ChecklistDto }> {
  return apiFetch("/api/checklists", { method: "POST", body: JSON.stringify({ projectId, assemblyLabel: assemblyLabel || undefined }) });
}

export interface AddChecklistItemInput {
  kind: "piece" | "subassembly";
  parentItemId?: string;
  number: string;
  quantity?: number;
  thickness?: string;
  material?: string;
  shapeType?: string;
  tubeShape?: string;
  tubeOD?: string;
  tubeID?: string;
  tubeMeasurement1?: string;
  tubeMeasurement2?: string;
  tubeWallThickness?: string;
  shaftMeasurement?: string;
  note?: string;
  activeStepIds: string[];
}

export function addChecklistItem(checklistId: string, input: AddChecklistItemInput): Promise<{ item: ChecklistItemDto }> {
  return apiFetch(`/api/checklists/${checklistId}/items`, { method: "POST", body: JSON.stringify(input) });
}

export function fetchActiveChecklistItems(filters: { stepId?: string; thickness?: string } = {}): Promise<{ items: ActiveChecklistItemDto[] }> {
  const params = new URLSearchParams();
  if (filters.stepId) params.set("stepId", filters.stepId);
  if (filters.thickness) params.set("thickness", filters.thickness);
  const query = params.toString();
  return apiFetch(`/api/checklists/active-items${query ? `?${query}` : ""}`);
}

export function fetchProjectChecklists(projectId: string): Promise<{ checklists: ChecklistWithItemsDto[] }> {
  return apiFetch(`/api/projects/${projectId}/checklists`);
}

export function setChecklistItemStepCompleted(itemId: string, stepId: string, completed: boolean): Promise<void> {
  return apiFetch(`/api/checklist-items/${itemId}/steps/${stepId}`, { method: "PATCH", body: JSON.stringify({ completed }) });
}
