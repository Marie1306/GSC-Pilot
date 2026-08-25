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
import { canAccessOverviewViews, canCreateInvoiceRecord, canSeeFinancialValues, type FinancialStatus, type Persona } from "@gsc-pilot/business-rules";
import { listProjects } from "../projects/service.js";
import { listRollings } from "../rollings/service.js";
import { listBudgets } from "../budgets/service.js";
import { listInvoiceEntries } from "../invoicing/service.js";
import { listMyTimeEntries } from "../timeEntries/service.js";
import { listDeliveries } from "../deliveries/service.js";
import { getActionCenterItems, type ActionItemDto } from "../actionCenter/service.js";
import { getChannelConversion, type ChannelConversionDto } from "../reports/service.js";

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

export interface ProjectHealthDto {
  projectNumber: string;
  name: string;
  progressionPct: number;
  grossMarginPct?: number;
  financialStatus?: FinancialStatus;
  deadline: string | null;
}

export interface RecentInvoiceDto {
  id: string;
  invoiceNumber: string;
  clientLabel: string;
  sourceLabel: string;
  processedAt: string | null;
  dueDate: string | null;
  amount: number;
  paidAmount: number;
  status: string;
}

export interface DashboardSummaryDto {
  activeProjectsCount?: number;
  activeRollingsCount?: number;
  budgetsInProgressCount?: number;
  invoicingToProcessCount?: number;
  receivableBalance?: number;
  recentInvoices?: RecentInvoiceDto[];
  portfolioMarginPct?: number;
  projectHealth?: ProjectHealthDto[];
  channelConversion?: ChannelConversionDto[];
  actionCenterCount: number;
  actionCenterBreakdown: string;
  actionCenterItems: ActionItemDto[];
  myWeekHours: number;
  myPendingEntriesCount: number;
  myAssignedDeliveriesCount?: number;
}

/** Combien de projets actifs / factures récentes / actions afficher — le reste se consulte sur la page dédiée (liens fournis côté interface). */
const PROJECT_HEALTH_LIMIT = 8;
const RECENT_INVOICES_LIMIT = 5;
const ACTION_CENTER_PREVIEW_LIMIT = 6;

export async function getDashboardSummary(viewerPersona: Persona, viewerEmployeeId: string): Promise<DashboardSummaryDto> {
  const summary: Partial<DashboardSummaryDto> = {};

  if (canAccessOverviewViews(viewerPersona)) {
    const [projects, rollings, budgets] = await Promise.all([listProjects(viewerPersona), listRollings(viewerPersona), listBudgets()]);
    const activeProjects = projects.filter((project) => project.lifecycleTab === "active");
    summary.activeProjectsCount = activeProjects.length;
    summary.activeRollingsCount = rollings.filter((rolling) => rolling.status === "active").length;
    summary.budgetsInProgressCount = budgets.length;

    // Marge du portefeuille actif — pondérée par le prix vendu (somme des
    // marges / somme des prix vendus), jamais une moyenne simple des % par
    // projet, qui pèserait un projet à 500 $ autant qu'un à 500 000 $.
    // Même sens que projectMargin (margin.ts), juste agrégée.
    if (canSeeFinancialValues(viewerPersona)) {
      const withFinancials = activeProjects.filter((p) => p.sold !== undefined && p.grossMargin !== undefined);
      const totalSold = round2(withFinancials.reduce((sum, p) => sum + (p.sold ?? 0), 0));
      const totalMargin = round2(withFinancials.reduce((sum, p) => sum + (p.grossMargin ?? 0), 0));
      summary.portfolioMarginPct = totalSold > 0 ? round2((totalMargin / totalSold) * 100) : 0;
    }

    // « Santé des projets actifs » — mêmes champs que la carte Projets
    // (progressionPct, grossMarginPct, financialStatus, déjà calculés en
    // lot par listProjects, jamais un second calcul divergent ici).
    summary.projectHealth = activeProjects.slice(0, PROJECT_HEALTH_LIMIT).map((p) => ({
      projectNumber: p.projectNumber,
      name: p.name,
      progressionPct: p.progressionPct ?? 0,
      grossMarginPct: p.grossMarginPct,
      financialStatus: p.financialStatus,
      deadline: p.deadline,
    }));

    // Rejoue getChannelConversion tel quel (Rapports) — l'utilisatrice a
    // confirmé vouloir ce même graphique visible ici aussi (23 août 2026 :
    // « le but d'un tableau de bord est justement de voir rapidement tout
    // ce qui est actif »), pas juste un lien vers Rapports.
    summary.channelConversion = await getChannelConversion();
  }

  if (canCreateInvoiceRecord(viewerPersona)) {
    const entries = await listInvoiceEntries();
    summary.invoicingToProcessCount = entries.filter((entry) => !entry.invoiceNumber).length;
    // Même calcul que la tuile « Solde à recevoir » de la page Facturation
    // (InvoicingPage.tsx) — jamais recalculé différemment ici.
    summary.receivableBalance = round2(
      entries.filter((entry) => entry.status !== "paid").reduce((sum, entry) => sum + (entry.amount - entry.paidAmount), 0),
    );
    // « Factures récemment envoyées » — mêmes entrées que Facturation,
    // seulement celles déjà enregistrées (invoiceNumber posé), triées par
    // date d'enregistrement plutôt que de demande (requestedAt, l'ordre par
    // défaut de listInvoiceEntries) — jamais un second calcul de statut,
    // status vient déjà d'invoiceStatus (billing.ts) via listInvoiceEntries.
    summary.recentInvoices = entries
      .filter((entry): entry is typeof entry & { invoiceNumber: string } => entry.invoiceNumber !== null)
      .sort((a, b) => (b.processedAt ?? "").localeCompare(a.processedAt ?? ""))
      .slice(0, RECENT_INVOICES_LIMIT)
      .map((entry) => ({
        id: entry.id,
        invoiceNumber: entry.invoiceNumber,
        clientLabel: entry.clientLabel,
        sourceLabel: entry.sourceLabel,
        processedAt: entry.processedAt,
        dueDate: entry.dueDate,
        amount: entry.amount,
        paidAmount: entry.paidAmount,
        status: entry.status,
      }));
  }

  // Centre d'actions — rejoue getActionCenterItems tel quel (déjà scopé par
  // persona à l'intérieur, comme le badge de navigation) : jamais une
  // deuxième requête divergente. Ventilation par typeLabel plutôt que les 3
  // catégories fixes du prototype v19 (demandes/heures/achats), qui ne
  // correspondent pas à nos 6 vrais types d'action.
  const actionItems = await getActionCenterItems(viewerPersona, viewerEmployeeId);
  const countByLabel = new Map<string, number>();
  for (const item of actionItems) {
    countByLabel.set(item.typeLabel, (countByLabel.get(item.typeLabel) ?? 0) + 1);
  }
  const actionCenterCount = actionItems.length;
  // "×" plutôt que d'essayer de plier typeLabel au pluriel français
  // (« nouvelle demande client » → « nouvelles demandes clients » n'est pas
  // qu'un -s, pas de solution générique propre ici).
  const actionCenterBreakdown = Array.from(countByLabel.entries())
    .map(([label, count]) => `${count} × ${label}`)
    .join(" · ");
  // Aperçu du Centre d'actions (demande explicite du 25 août 2026, mini-liste
  // v19) — même tableau actionItems déjà calculé ci-dessus, juste tronqué.
  const actionCenterItems = actionItems.slice(0, ACTION_CENTER_PREVIEW_LIMIT);

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

  return { ...summary, actionCenterCount, actionCenterBreakdown, actionCenterItems, myWeekHours, myPendingEntriesCount };
}
