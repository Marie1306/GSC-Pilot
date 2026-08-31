import { apiFetch } from "../../lib/apiClient.js";

export const INTERRUPTION_REASONS = [
  "absence",
  "vacances",
  "service_urgent",
  "livraison",
  "formation",
  "maintenance_interne",
  "jour_ferie",
  "autre",
] as const;
export type InterruptionReason = (typeof INTERRUPTION_REASONS)[number];

export const INTERRUPTION_REASON_LABELS: Record<InterruptionReason, string> = {
  absence: "Absence",
  vacances: "Vacances",
  service_urgent: "Appel de service urgent",
  livraison: "Livraison",
  formation: "Formation",
  maintenance_interne: "Maintenance interne",
  jour_ferie: "Jour férié",
  autre: "Autre",
};

export interface InterruptionDto {
  id: string;
  employeeId: string | null;
  employeeName: string | null;
  date: string;
  hours: number;
  reason: InterruptionReason;
  reference: string | null;
  createdByName: string;
  createdAt: string;
}

export interface InterruptionInput {
  employeeId?: string | null;
  date: string;
  hours: number;
  reason: InterruptionReason;
  reference?: string;
}

export function fetchInterruptions(): Promise<{ interruptions: InterruptionDto[] }> {
  return apiFetch("/api/interruptions");
}

export function createInterruption(input: InterruptionInput): Promise<{ interruption: InterruptionDto }> {
  return apiFetch("/api/interruptions", { method: "POST", body: JSON.stringify(input) });
}

export function updateInterruption(id: string, input: InterruptionInput): Promise<{ interruption: InterruptionDto }> {
  return apiFetch(`/api/interruptions/${id}`, { method: "PATCH", body: JSON.stringify(input) });
}

export function deleteInterruption(id: string): Promise<void> {
  return apiFetch(`/api/interruptions/${id}`, { method: "DELETE" });
}
