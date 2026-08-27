import { apiFetch } from "../../lib/apiClient.js";
import { FULFILLMENT_MODES, type FulfillmentMode, type ProjectLifecycleTab } from "@gsc-pilot/business-rules";

export type { FulfillmentMode, ProjectLifecycleTab };

export const LIFECYCLE_TAB_LABELS: Record<ProjectLifecycleTab, string> = {
  active: "Actifs",
  warranty: "Garantie",
  closed: "Fermés",
};

export type FinancialStatus = "conforme" | "at_risk" | "critical";

export interface ProjectListItem {
  id: string;
  projectNumber: string;
  name: string;
  status: string;
  contactName: string;
  company: string | null;
  deadline: string | null;
  sold?: number;
  hoursUsedPct: number;
  progressionPct?: number;
  grossMarginPct?: number;
  financialStatus?: FinancialStatus;
  warrantyExpected: boolean;
  warrantyEndsAt: string | null;
  lifecycleTab: ProjectLifecycleTab;
}

export const STATUS_LABELS: Record<string, string> = {
  active: "Actif",
  ready_invoice: "Prêt à facturer",
  closed: "Terminé",
};

export const FINANCIAL_STATUS_LABELS: Record<FinancialStatus, string> = {
  conforme: "Conforme",
  at_risk: "À risque",
  critical: "Critique",
};

export interface ProjectComparatifTaskRow {
  taskId: string;
  taskLabel: string;
  plannedHours: number;
  actualHours: number;
  hoursDelta: number;
  plannedCost?: number;
  actualCost?: number;
  costDelta?: number;
}

export interface ProjectComparatifRow {
  category: string;
  categoryLabel: string;
  plannedHours: number;
  actualHours: number;
  hoursDelta: number;
  plannedCost?: number;
  actualCost?: number;
  costDelta?: number;
  /** Absent pour un projet sans budgétaire d'origine. Affiché seulement dans le post-mortem (ProjectDetail.tsx reste au niveau catégorie). */
  tasks?: ProjectComparatifTaskRow[];
}

/**
 * Vue enrichie de la Phase 2A (17 août 2026). Les champs $ sont absents
 * (pas juste à 0) pour Employé/Magasinier — voir canSeeFinancialValues côté
 * serveur — donc tous optionnels ici plutôt que number avec une valeur par
 * défaut trompeuse.
 */
export interface ProjectDetail {
  id: string;
  projectNumber: string;
  name: string;
  status: string;
  contactId: string;
  contactName: string;
  company: string | null;
  budgetId: string | null;
  budgetDisplayId: string | null;
  clientRequestId: string | null;
  createdAt: string;
  sold?: number;
  plannedHours: number;
  actualHours: number;
  hoursUsedPct: number;
  plannedPurchases?: number;
  actualPurchases?: number;
  installationPlannedHours: number;
  installationPlannedCost?: number;
  backupHours: number;
  backupHoursCost?: number;
  projectBackupAmount?: number;
  grossMargin?: number;
  grossMarginPct?: number;
  targetMarginPct?: number | null;
  backupHourlyRate?: number | null;
  financialStatus?: FinancialStatus;
  progressionPct?: number;
  comparatif: ProjectComparatifRow[];
  productionCompleted: boolean;
  fulfillmentMode: FulfillmentMode | null;
  fulfillmentStatus: string | null;
  fulfillmentAddress: string | null;
  fulfillmentConfirmationNote: string | null;
  billingReady: boolean;
  warrantyExpected: boolean;
  warrantyEndsAt: string | null;
  lifecycleTab: ProjectLifecycleTab;
  deadline: string | null;
  archivedAt: string | null;
  deletedAt: string | null;
}

export const FULFILLMENT_MODE_LABELS: Record<FulfillmentMode, string> = {
  [FULFILLMENT_MODES.WAREHOUSE]: "Bon de livraison (magasinier)",
  [FULFILLMENT_MODES.MANUAL]: "Livraison par un tiers",
  [FULFILLMENT_MODES.PICKUP]: "Ramassage par le client",
  [FULFILLMENT_MODES.INSTALLATION]: "Installation par GSC",
};

export const FULFILLMENT_STATUS_LABELS: Record<string, string> = {
  planned: "Livraison planifiée — magasinier",
  awaiting_confirmation: "En attente de confirmation",
  installation_planned: "Installation en cours",
  completed: "Confirmé",
};

export type InvoiceEntryStatus = "pending" | "sent" | "paid" | "on_hold" | "overdue";

export const INVOICE_STATUS_LABELS: Record<InvoiceEntryStatus, string> = {
  pending: "À venir",
  sent: "Envoyée",
  paid: "Payée",
  on_hold: "En suspens",
  overdue: "En retard",
};

export const INVOICE_STATUS_BADGE: Record<InvoiceEntryStatus, string> = {
  pending: "badge-neutral",
  sent: "badge-neutral",
  paid: "badge-conforme",
  on_hold: "badge-at_risk",
  overdue: "badge-critical",
};

export interface InvoicePlanEntryDto {
  id: string;
  label: string;
  pct: number;
  amount: number;
  status: InvoiceEntryStatus;
  invoiceNumber: string | null;
  dueDate: string | null;
  paidAmount: number;
  paidAt: string | null;
  isExtra: boolean;
  requestedById: string | null;
  requestedAt: string | null;
  processedById: string | null;
  processedAt: string | null;
}

const currencyFormatter = new Intl.NumberFormat("fr-CA", { style: "currency", currency: "CAD" });
export function formatCurrency(value: number): string {
  return currencyFormatter.format(value);
}

export function fetchProjects(): Promise<{ projects: ProjectListItem[] }> {
  return apiFetch("/api/projects/full");
}

export function fetchProjectDetail(id: string): Promise<{ project: ProjectDetail }> {
  return apiFetch(`/api/projects/${id}`);
}

export function convertBudgetToProject(
  budgetId: string,
  name: string,
  projectNumber?: string,
): Promise<{ id: string; projectNumber: string }> {
  return apiFetch(`/api/budgets/${budgetId}/convert-to-project`, { method: "POST", body: JSON.stringify({ name, projectNumber }) });
}

/** Numéro suggéré (plus grand existant + 1) pour préremplir le champ — jamais deviné côté interface. */
export function fetchNextProjectNumber(): Promise<{ nextProjectNumber: number }> {
  return apiFetch("/api/projects/next-number");
}

export interface NewProjectContactInput {
  contactName: string;
  company?: string;
  contactRole?: string;
  phone?: string;
  email?: string;
}

export interface CreateProjectInput {
  name: string;
  projectNumber?: string;
  newContact: NewProjectContactInput;
}

/** Création directe, hors conversion d'un budgétaire — Direction et Propriétaire seulement (canCreateProjectDirectly). */
export function createProject(input: CreateProjectInput): Promise<{ id: string; projectNumber: string }> {
  return apiFetch("/api/projects", { method: "POST", body: JSON.stringify(input) });
}

export interface UpdateProjectPlanningInput {
  sold?: number;
  plannedHours?: number;
  plannedPurchases?: number;
  installationPlannedHours?: number;
  installationPlannedCost?: number;
}

/**
 * Remplir après coup les champs qu'un budgétaire aurait fournis — projets
 * sans budgétaire d'origine seulement, mêmes rôles que la création directe.
 * Chaque champ est indépendant : en remplir un ne change jamais les autres
 * (confirmé le 19 août 2026 — surtout, remplir les heures ne change jamais
 * le prix vendu).
 */
export function updateProjectPlanning(id: string, input: UpdateProjectPlanningInput): Promise<void> {
  return apiFetch(`/api/projects/${id}/planning`, { method: "PATCH", body: JSON.stringify(input) });
}

// ---------------------------------------------------------------------------
// Production et sortie + Cycle de facturation (Projet 2C, 17 août 2026).
// ---------------------------------------------------------------------------

export function markProductionComplete(id: string): Promise<void> {
  return apiFetch(`/api/projects/${id}/mark-production-complete`, { method: "POST" });
}

export interface ChooseFulfillmentInput {
  mode: FulfillmentMode;
  driverId?: string;
  address?: string;
  scheduled?: string;
}

export function chooseFulfillmentMode(id: string, input: ChooseFulfillmentInput): Promise<void> {
  return apiFetch(`/api/projects/${id}/fulfillment`, { method: "POST", body: JSON.stringify(input) });
}

export function confirmFulfillment(id: string, note?: string): Promise<void> {
  return apiFetch(`/api/projects/${id}/fulfillment/confirm`, { method: "POST", body: JSON.stringify({ note }) });
}

export function fetchInvoicePlan(projectId: string): Promise<{ entries: InvoicePlanEntryDto[] }> {
  return apiFetch(`/api/projects/${projectId}/invoice-plan`);
}

export interface BillingPlanStepInput {
  label: string;
  pct: number;
}

/**
 * Remplace entièrement le cycle de facturation par des jalons personnalisés
 * (26 août 2026, confirmé : jalons entièrement personnalisables, pas
 * seulement les % des 4 par défaut). Bloqué côté serveur (409) dès qu'un
 * jalon existant a déjà été demandé/facturé/payé.
 */
export function updateInvoicePlan(projectId: string, steps: BillingPlanStepInput[]): Promise<{ entries: InvoicePlanEntryDto[] }> {
  return apiFetch(`/api/projects/${projectId}/invoice-plan`, { method: "PUT", body: JSON.stringify({ steps }) });
}

export function requestInvoice(entryId: string): Promise<{ entry: InvoicePlanEntryDto }> {
  return apiFetch(`/api/invoice-plan/${entryId}/request`, { method: "POST" });
}

export interface RecordInvoiceInput {
  invoiceNumber: string;
  dueDate?: string;
}

export function recordInvoice(entryId: string, input: RecordInvoiceInput): Promise<{ entry: InvoicePlanEntryDto }> {
  return apiFetch(`/api/invoice-plan/${entryId}/record`, { method: "POST", body: JSON.stringify(input) });
}

export function recordInvoicePayment(entryId: string, paidAmount: number): Promise<{ entry: InvoicePlanEntryDto }> {
  return apiFetch(`/api/invoice-plan/${entryId}/payment`, { method: "PATCH", body: JSON.stringify({ paidAmount }) });
}

// ---------------------------------------------------------------------------
// Garantie (Projet 2D, 17 août 2026).
// ---------------------------------------------------------------------------

export interface WarrantyHistoryEntryDto {
  id: string;
  previousEndsAt: string | null;
  newEndsAt: string;
  reason: string | null;
  invoiceReference: string | null;
  changedById: string;
  changedByName: string;
  changedAt: string;
}

export function setWarrantyExpected(id: string, expected: boolean): Promise<void> {
  return apiFetch(`/api/projects/${id}/warranty-expected`, { method: "PATCH", body: JSON.stringify({ expected }) });
}

export function fetchWarrantyHistory(projectId: string): Promise<{ entries: WarrantyHistoryEntryDto[] }> {
  return apiFetch(`/api/projects/${projectId}/warranty-history`);
}

export interface ActivateWarrantyInput {
  endsAt: string;
  reason?: string;
  invoiceReference?: string;
}

export function activateWarranty(id: string, input: ActivateWarrantyInput): Promise<{ entry: WarrantyHistoryEntryDto }> {
  return apiFetch(`/api/projects/${id}/warranty`, { method: "POST", body: JSON.stringify(input) });
}

// ---------------------------------------------------------------------------
// Menu Options du projet (Projet 2F, 17 août 2026).
// ---------------------------------------------------------------------------

export interface UpdateProjectInfoInput {
  name?: string;
  deadline?: string | null;
}

export function updateProjectInfo(id: string, input: UpdateProjectInfoInput): Promise<void> {
  return apiFetch(`/api/projects/${id}`, { method: "PATCH", body: JSON.stringify(input) });
}

export function setProjectArchived(id: string, archived: boolean): Promise<void> {
  return apiFetch(`/api/projects/${id}/archived`, { method: "PATCH", body: JSON.stringify({ archived }) });
}

export function deleteProject(id: string): Promise<void> {
  return apiFetch(`/api/projects/${id}`, { method: "DELETE" });
}

export interface HistoryEventDto {
  at: string;
  label: string;
  actorName?: string;
}

export function fetchProjectHistory(id: string): Promise<{ events: HistoryEventDto[] }> {
  return apiFetch(`/api/projects/${id}/history`);
}

// ---------------------------------------------------------------------------
// Post-mortem (Projet 2E, 17 août 2026). Le Comparatif main-d'oeuvre reste au
// niveau catégorie pour l'instant — le détail par sous-tâche demande le lien
// punch → tâche (TimeEntry.taskId, actuellement inutilisé), spécification à
// venir de l'utilisatrice.
// ---------------------------------------------------------------------------

export interface PostMortemCostRow {
  label: string;
  planned: number;
  actual: number;
}

export interface PostMortemDto {
  id: string;
  projectNumber: string;
  name: string;
  plannedHours: number;
  actualHours: number;
  backupHours: number;
  comparatif: ProjectComparatifRow[];
  sold?: number;
  plannedPurchases?: number;
  actualPurchases?: number;
  backupHoursCost?: number;
  projectBackupAmount?: number;
  grossMargin?: number;
  grossMarginPct?: number;
  financialStatus?: FinancialStatus;
  costBreakdown?: PostMortemCostRow[];
  postMortemDepassements: string | null;
  postMortemAmeliorations: string | null;
  postMortemRecommandation: string | null;
}

export function fetchPostMortem(id: string): Promise<{ postMortem: PostMortemDto }> {
  return apiFetch(`/api/projects/${id}/post-mortem`);
}

export interface UpdatePostMortemInput {
  depassements?: string;
  ameliorations?: string;
  recommandation?: string;
}

export function updatePostMortemAnalysis(id: string, input: UpdatePostMortemInput): Promise<void> {
  return apiFetch(`/api/projects/${id}/post-mortem`, { method: "PATCH", body: JSON.stringify(input) });
}

export interface ApprovedTimeEntryDto {
  id: string;
  date: string;
  employeeName: string;
  category: string;
  taskLabel: string;
  hours: number;
  cost?: number;
}

export function fetchApprovedTimeEntries(id: string): Promise<{ entries: ApprovedTimeEntryDto[] }> {
  return apiFetch(`/api/projects/${id}/approved-hours`);
}

export interface ApprovedPurchaseEntryDto {
  id: string;
  date: string;
  source: string;
  category: string;
  description: string;
  supplier: string | null;
  amount?: number;
}

export function fetchApprovedPurchaseEntries(id: string): Promise<{ entries: ApprovedPurchaseEntryDto[] }> {
  return apiFetch(`/api/projects/${id}/approved-purchases`);
}
