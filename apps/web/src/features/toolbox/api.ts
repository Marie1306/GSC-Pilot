import { apiFetch } from "../../lib/apiClient.js";
import type { ChecklistCatalogDto } from "../settings/api.js";
import type { CitedTextBlock } from "../../components/CitedText.js";

// ToolboxCategoryDto a exactement la forme de ChecklistCatalogDto ({id,label,active,sortOrder}) — réutilisé tel quel pour ChecklistCatalogCard (voir ToolboxPage.tsx), jamais un deuxième type dupliqué.
export type ToolboxCategoryDto = ChecklistCatalogDto;

export function fetchToolboxCategories(): Promise<ToolboxCategoryDto[]> {
  return apiFetch<{ categories: ToolboxCategoryDto[] }>("/api/toolbox/categories").then((r) => r.categories);
}
export function createToolboxCategory(label: string, insertBeforeId?: string): Promise<ToolboxCategoryDto> {
  return apiFetch("/api/toolbox/categories", { method: "POST", body: JSON.stringify({ label, insertBeforeId }) });
}
export function updateToolboxCategory(id: string, update: { label?: string; active?: boolean }): Promise<ToolboxCategoryDto> {
  return apiFetch(`/api/toolbox/categories/${id}`, { method: "PATCH", body: JSON.stringify(update) });
}

export interface ToolboxChartDto {
  id: string;
  fileName: string;
  fileSize: number;
  active: boolean;
  uploadedByName: string;
  uploadedAt: string;
}
export function fetchToolboxCharts(categoryId: string): Promise<{ charts: ToolboxChartDto[] }> {
  return apiFetch(`/api/toolbox/categories/${categoryId}/charts`);
}
export function fetchToolboxChartDownloadUrl(chartId: string): Promise<{ url: string }> {
  return apiFetch(`/api/toolbox/charts/${chartId}/download-url`);
}
export function retireToolboxChart(chartId: string, active: boolean): Promise<void> {
  return apiFetch(`/api/toolbox/charts/${chartId}`, { method: "PATCH", body: JSON.stringify({ active }) });
}

export interface ToolboxThreadListItemDto {
  id: string;
  categoryId: string;
  categoryLabel: string;
  startedByName: string;
  startedAt: string;
  lastMessageAt: string;
  firstQuestion: string;
}
export function fetchToolboxThreads(categoryId?: string): Promise<{ threads: ToolboxThreadListItemDto[] }> {
  return apiFetch(categoryId ? `/api/toolbox/threads?categoryId=${categoryId}` : "/api/toolbox/threads");
}

export interface ToolboxMessageDto {
  id: string;
  role: string;
  authorName: string | null;
  content: CitedTextBlock[];
  createdAt: string;
}
export interface ToolboxThreadDetailDto {
  id: string;
  categoryId: string;
  categoryLabel: string;
  messages: ToolboxMessageDto[];
}
export function fetchToolboxThreadDetail(id: string): Promise<ToolboxThreadDetailDto> {
  return apiFetch(`/api/toolbox/threads/${id}`);
}

export function startToolboxThread(categoryId: string, message: string): Promise<{ id: string }> {
  return apiFetch("/api/toolbox/threads", { method: "POST", body: JSON.stringify({ categoryId, message }) });
}
export function continueToolboxThread(threadId: string, message: string): Promise<{ id: string }> {
  return apiFetch(`/api/toolbox/threads/${threadId}/messages`, { method: "POST", body: JSON.stringify({ message }) });
}
