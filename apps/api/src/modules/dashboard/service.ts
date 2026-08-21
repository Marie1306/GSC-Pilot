/**
 * GSC Pilot — Tableau de bord (21 août 2026)
 *
 * Confirmé (spécification) : « vue de synthèse personnalisée par
 * utilisateur ». Cet écran reste accessible à TOUS les rôles (c'est la
 * route "/", la cible de repli de RequireRole quand un rôle est refusé
 * ailleurs — la restreindre créerait une boucle de redirection infinie
 * pour Employé/Magasinier). La restriction de visibilité financière
 * confirmée pour Tableau de bord/Rapports/Contacts s'applique donc au
 * CONTENU seulement, jamais à la route elle-même — même principe que
 * partout ailleurs dans l'application (voir CLAUDE.md — piège de
 * nommage des rôles — même discipline appliquée ici).
 *
 * Chaque compteur réutilise une fonction déjà vérifiée d'un autre module
 * (listProjects, listRollings, listBudgets, listInvoiceEntries,
 * listMyTimeEntries, listDeliveries) — jamais une deuxième requête
 * divergente. « Appels de service actifs » a été délibérément omis : le
 * champ ServiceCall.status n'est en fait jamais mis à jour nulle part
 * dans le code (toujours "scheduled") — un compteur basé dessus serait
 * trompeur, pas juste incomplet.
 *
 * Première étape confirmée par l'utilisatrice avant le Centre d'actions
 * (plus gros morceau, à venir) — volontairement simple : quelques
 * compteurs par rôle, jamais une deuxième liste d'actions à traiter.
 */
import { canAccessOverviewViews, canCreateInvoiceRecord, type Persona } from "@gsc-pilot/business-rules";
import { listProjects } from "../projects/service.js";
import { listRollings } from "../rollings/service.js";
import { listBudgets } from "../budgets/service.js";
import { listInvoiceEntries } from "../invoicing/service.js";
import { listMyTimeEntries } from "../timeEntries/service.js";
import { listDeliveries } from "../deliveries/service.js";

function round2(value: number): number {
  return Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100;
}

/** Lundi de la semaine courante (semaine québécoise lun-dim) — affichage seulement, jamais une règle de paie. */
function startOfWeek(date: Date): Date {
  const day = date.getDay(); // 0 = dimanche
  const diff = (day === 0 ? -6 : 1) - day;
  const monday = new Date(date);
  monday.setDate(date.getDate() + diff);
  monday.setHours(0, 0, 0, 0);
  return monday;
}

export interface DashboardSummaryDto {
  activeProjectsCount?: number;
  activeRollingsCount?: number;
  budgetsInProgressCount?: number;
  invoicingToProcessCount?: number;
  myWeekHours: number;
  myPendingEntriesCount: number;
  myAssignedDeliveriesCount?: number;
}

export async function getDashboardSummary(viewerPersona: Persona, viewerEmployeeId: string): Promise<DashboardSummaryDto> {
  const summary: Partial<DashboardSummaryDto> = {};

  if (canAccessOverviewViews(viewerPersona)) {
    const [projects, rollings, budgets] = await Promise.all([listProjects(viewerPersona), listRollings(viewerPersona), listBudgets()]);
    summary.activeProjectsCount = projects.filter((project) => project.lifecycleTab === "active").length;
    summary.activeRollingsCount = rollings.filter((rolling) => rolling.status === "active").length;
    summary.budgetsInProgressCount = budgets.length;
  }

  if (canCreateInvoiceRecord(viewerPersona)) {
    const entries = await listInvoiceEntries();
    summary.invoicingToProcessCount = entries.filter((entry) => !entry.invoiceNumber).length;
  }

  const myEntries = await listMyTimeEntries(viewerEmployeeId, viewerPersona);
  const weekStart = startOfWeek(new Date());
  const myWeekHours = round2(
    myEntries.filter((entry) => new Date(entry.date) >= weekStart).reduce((sum, entry) => sum + (entry.roundedMinutes ?? 0) / 60, 0),
  );
  const myPendingEntriesCount = myEntries.filter((entry) => entry.status === "submitted").length;

  if (viewerPersona === "warehouse") {
    const deliveries = await listDeliveries(viewerPersona, viewerEmployeeId);
    summary.myAssignedDeliveriesCount = deliveries.filter((delivery) => delivery.status === "planned").length;
  }

  return { ...summary, myWeekHours, myPendingEntriesCount };
}
