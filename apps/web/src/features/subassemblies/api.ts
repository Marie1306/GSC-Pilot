import { apiFetch } from "../../lib/apiClient.js";

export type SubassemblyStatus = "pending_parts_list" | "ready_for_production";

export interface SubassemblyDto {
  id: string;
  projectId: string;
  number: string;
  declaredByName: string;
  declaredAt: string;
  status: SubassemblyStatus;
  partsListPreparedByName: string | null;
  partsListPreparedAt: string | null;
  hoursByCategory: Record<string, number> | null;
  assemblyReadyDeclaredByName: string | null;
  assemblyReadyDeclaredAt: string | null;
}

export function fetchProjectSubassemblies(projectId: string): Promise<{ subassemblies: SubassemblyDto[] }> {
  return apiFetch(`/api/projects/${projectId}/subassemblies`);
}

export function fetchMySubassemblies(): Promise<{ subassemblies: SubassemblyDto[] }> {
  return apiFetch("/api/subassemblies/mine");
}

export function declareSubassembly(projectId: string, number: string): Promise<{ subassembly: SubassemblyDto }> {
  return apiFetch(`/api/projects/${projectId}/subassemblies`, { method: "POST", body: JSON.stringify({ number }) });
}

export function markPartsListReady(id: string, hoursByCategory: Record<string, number>): Promise<{ subassembly: SubassemblyDto }> {
  return apiFetch(`/api/subassemblies/${id}/parts-list`, { method: "POST", body: JSON.stringify({ hoursByCategory }) });
}

export function declareAssemblyReady(id: string): Promise<{ subassembly: SubassemblyDto }> {
  return apiFetch(`/api/subassemblies/${id}/assembly-ready`, { method: "POST" });
}
