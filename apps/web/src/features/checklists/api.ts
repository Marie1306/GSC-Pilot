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

export interface ActiveChecklistProjectDto {
  projectId: string;
  projectNumber: string;
  projectName: string;
  activeChecklistCount: number;
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
  /** Contourne l'avertissement d'unicité de numéro par projet (« Ajouter quand même »). */
  force?: boolean;
}

export function addChecklistItem(checklistId: string, input: AddChecklistItemInput): Promise<{ item: ChecklistItemDto }> {
  return apiFetch(`/api/checklists/${checklistId}/items`, { method: "POST", body: JSON.stringify(input) });
}

export interface UpdateChecklistItemInput {
  number?: string;
  quantity?: number | null;
  thickness?: string | null;
  material?: string | null;
  shapeType?: string | null;
  tubeShape?: string | null;
  tubeOD?: string | null;
  tubeID?: string | null;
  tubeMeasurement1?: string | null;
  tubeMeasurement2?: string | null;
  tubeWallThickness?: string | null;
  shaftMeasurement?: string | null;
  note?: string | null;
  activeStepIds?: string[];
  force?: boolean;
}

export function updateChecklistItem(itemId: string, input: UpdateChecklistItemInput): Promise<{ item: ChecklistItemDto }> {
  return apiFetch(`/api/checklist-items/${itemId}`, { method: "PATCH", body: JSON.stringify(input) });
}

/** Projets ayant au moins une checklist active — alimente la grille de cartes de la page Checklist. */
export function fetchProjectsWithActiveChecklists(): Promise<{ projects: ActiveChecklistProjectDto[] }> {
  return apiFetch("/api/checklists/active-projects");
}

/**
 * Archive complète d'un projet (Options du projet → Checklist de
 * production) — canAccessProject côté serveur, jamais exposée à l'Employé.
 * Pour la vue de travail (menu "Checklist de production"), utiliser
 * fetchChecklistsForProject ci-dessous — ne jamais réutiliser celle-ci là,
 * c'est exactement l'écart trouvé et corrigé le 26 août 2026.
 */
export function fetchProjectChecklists(projectId: string): Promise<{ checklists: ChecklistWithItemsDto[] }> {
  return apiFetch(`/api/projects/${projectId}/checklists`);
}

/** Vue de travail (ChecklistProjectView) — canAccessProductionChecklist côté serveur, accessible à l'Employé (tout le monde sauf Magasinier). */
export function fetchChecklistsForProject(projectId: string): Promise<{ checklists: ChecklistWithItemsDto[] }> {
  return apiFetch(`/api/checklists/projects/${projectId}`);
}

export function setChecklistItemStepCompleted(itemId: string, stepId: string, completed: boolean): Promise<void> {
  return apiFetch(`/api/checklist-items/${itemId}/steps/${stepId}`, { method: "PATCH", body: JSON.stringify({ completed }) });
}
