import { apiFetch } from "../../lib/apiClient.js";
import type { CitedTextBlock } from "../../components/CitedText.js";

export const SEAO_STATUS_LABELS: Record<string, string> = {
  a_l_etude: "À l'étude",
  non_soumissionne: "Non soumissionné",
  en_soumission: "En soumission",
  gagne: "Gagné",
  perdu: "Perdu",
};

export interface NextSeaoNumberDto {
  nextDisplayId: string;
  defaultMarginPct: number;
}
export function fetchNextSeaoNumber(): Promise<NextSeaoNumberDto> {
  return apiFetch("/api/seao/next-number");
}

export interface SeaoFileListItemDto {
  id: string;
  displayId: string;
  title: string | null;
  contactName: string;
  company: string | null;
  status: string;
  submissionDeadline: string | null;
  createdAt: string;
  hasDocuments: boolean;
}
export function fetchSeaoFiles(): Promise<{ seaoFiles: SeaoFileListItemDto[] }> {
  return apiFetch("/api/seao");
}

export interface SeaoDocumentDto {
  id: string;
  fileName: string;
  fileSize: number;
  uploadedByName: string;
  uploadedAt: string;
}
export interface SeaoAdministrationItemDto {
  label: string;
  value: string;
}
export interface SeaoAnalysisDto {
  id: string;
  version: number;
  summaryContent: CitedTextBlock[];
  /** Nul pour une analyse antérieure au 16 septembre 2026 (avant la restructuration en 3 catégories) — jamais recalculé rétroactivement. */
  technicalContent: CitedTextBlock[] | null;
  adminContent: SeaoAdministrationItemDto[] | null;
  changesContent: CitedTextBlock[] | null;
  requestedByName: string;
  createdAt: string;
}
export interface SeaoBordereauLineDto {
  id: string;
  description: string;
  cost: number;
  marginPct: number;
  salePrice: number;
  source: string;
  sortOrder: number;
}
export interface SeaoCompetitorDto {
  id: string;
  companyName: string;
  submittedPrice: number;
}
export interface SeaoNoteDto {
  id: string;
  authorName: string;
  body: string;
  createdAt: string;
}
export interface SeaoFileDetailDto extends SeaoFileListItemDto {
  referenceNumber: string | null;
  contactId: string;
  goNoGoDecidedAt: string | null;
  nonSubmissionReason: string | null;
  outcomeDecidedAt: string | null;
  projectId: string | null;
  documents: SeaoDocumentDto[];
  analyses: SeaoAnalysisDto[];
  bordereauLines: SeaoBordereauLineDto[];
  competitors: SeaoCompetitorDto[];
  notes: SeaoNoteDto[];
}
export function fetchSeaoFileDetail(id: string): Promise<SeaoFileDetailDto> {
  return apiFetch(`/api/seao/${id}`);
}

export interface NewSeaoContactInput {
  contactName: string;
  company?: string;
  contactRole?: string;
  phone?: string;
  email?: string;
}
export interface CreateSeaoFileInput {
  newContact: NewSeaoContactInput;
  referenceNumber?: string;
  title?: string;
  submissionDeadline?: string;
}
export function createSeaoFile(input: CreateSeaoFileInput): Promise<{ id: string; displayId: string }> {
  return apiFetch("/api/seao", { method: "POST", body: JSON.stringify(input) });
}

export function fetchSeaoDocumentDownloadUrl(documentId: string): Promise<{ url: string }> {
  return apiFetch(`/api/seao/documents/${documentId}/download-url`);
}

export function triggerSeaoAnalysis(id: string): Promise<{ id: string; version: number }> {
  return apiFetch(`/api/seao/${id}/analyze`, { method: "POST" });
}

export function decideSeaoGoNoGo(id: string, go: boolean, nonSubmissionReason?: string): Promise<void> {
  return apiFetch(`/api/seao/${id}/go-no-go`, { method: "POST", body: JSON.stringify({ go, nonSubmissionReason }) });
}
export function recordSeaoOutcome(id: string, won: boolean): Promise<void> {
  return apiFetch(`/api/seao/${id}/outcome`, { method: "POST", body: JSON.stringify({ won }) });
}
export function convertSeaoFileToProject(id: string, name: string, projectNumber?: string): Promise<{ projectId: string; projectNumber: string }> {
  return apiFetch(`/api/seao/${id}/convert-to-project`, { method: "POST", body: JSON.stringify({ name, projectNumber }) });
}

export interface SeaoBordereauLineInput {
  description: string;
  cost: number;
  marginPct: number;
}
export function createSeaoBordereauLine(seaoFileId: string, input: SeaoBordereauLineInput): Promise<{ id: string }> {
  return apiFetch(`/api/seao/${seaoFileId}/bordereau-lines`, { method: "POST", body: JSON.stringify(input) });
}
export function updateSeaoBordereauLine(lineId: string, input: Partial<SeaoBordereauLineInput>): Promise<void> {
  return apiFetch(`/api/seao/bordereau-lines/${lineId}`, { method: "PATCH", body: JSON.stringify(input) });
}
export function deleteSeaoBordereauLine(lineId: string): Promise<void> {
  return apiFetch(`/api/seao/bordereau-lines/${lineId}`, { method: "DELETE" });
}

export function createSeaoCompetitor(seaoFileId: string, companyName: string, submittedPrice: number): Promise<{ id: string }> {
  return apiFetch(`/api/seao/${seaoFileId}/competitors`, { method: "POST", body: JSON.stringify({ companyName, submittedPrice }) });
}
export function deleteSeaoCompetitor(competitorId: string): Promise<void> {
  return apiFetch(`/api/seao/competitors/${competitorId}`, { method: "DELETE" });
}

export function addSeaoNote(seaoFileId: string, body: string): Promise<{ id: string }> {
  return apiFetch(`/api/seao/${seaoFileId}/notes`, { method: "POST", body: JSON.stringify({ body }) });
}
