import {
  canAccessBudget,
  canAccessServiceCalls,
  canAccessSettings,
  canAccessOverviewViews,
  canAccessDeliveries,
  canCreateInvoiceRecord,
  canViewClientRequests,
  type Persona,
} from "@gsc-pilot/business-rules";

export type NavSection = "overview" | "sales" | "operations" | "admin";

export interface NavItem {
  key: string;
  label: string;
  path: string;
  section: NavSection;
  /** Visibilité de navigation seulement — l'autorisation réelle vit côté serveur (voir apps/api). */
  allow: (persona: Persona) => boolean;
}

const everyone = () => true;

/**
 * Provisoire : aucune fonction dédiée dans roles.ts pour la simple
 * VISIBILITÉ de ces sections (seulement pour des actions précises à
 * l'intérieur) — Direction/Administration/Propriétaire par défaut,
 * cohérent avec le principe général de visibilité financière. À
 * reconfirmer avec la spécification quand chaque module sera vraiment
 * construit (voir CLAUDE.md).
 */
const backOfficeOnly = canAccessOverviewViews; // owner/admin/boss

export const NAV_SECTION_LABELS: Record<NavSection, string> = {
  overview: "Vue d'ensemble",
  sales: "Ventes et projets",
  operations: "Opérations",
  admin: "Administration",
};

// Ordre + libellés alignés sur la barre latérale de la v19 (21 août 2026,
// demande explicite de l'utilisatrice — visuel/libellés seulement, aucune
// permission changée). "Centre d'actions" (v19) n'existe pas encore comme
// écran séparé, pas ajouté ici. Scan QR n'apparaît pas dans la v19 mais
// reste une vraie fonctionnalité confirmée (hors ligne, voir CLAUDE.md) —
// placé à côté de Punch et heures, même tâche de terrain.
export const NAV_ITEMS: NavItem[] = [
  { key: "dashboard", label: "Tableau de bord", path: "/", section: "overview", allow: everyone },
  { key: "client-requests", label: "Demandes clients", path: "/demandes", section: "sales", allow: canViewClientRequests },
  { key: "projects", label: "Projets", path: "/projets", section: "sales", allow: backOfficeOnly },
  { key: "budgets", label: "Budgétaires", path: "/budgetaire", section: "sales", allow: canAccessBudget },
  { key: "gantt", label: "Gantt / capacité", path: "/gantt", section: "sales", allow: backOfficeOnly },
  // canCreateRollingDirectly (owner/boss) est un sous-ensemble de
  // canAccessOverviewViews (owner/admin/boss) — le OR d'origine était
  // redondant, simplifié ici (aucun changement de comportement).
  { key: "rollings", label: "Roulements", path: "/roulements", section: "sales", allow: canAccessOverviewViews },
  { key: "reports", label: "Rapports / statistiques", path: "/rapports", section: "sales", allow: canAccessOverviewViews },
  { key: "time-punch", label: "Punch et heures", path: "/temps", section: "operations", allow: everyone },
  { key: "qr-scan", label: "Scan QR", path: "/scan", section: "operations", allow: everyone },
  { key: "service-calls", label: "Appels de service", path: "/appels-service", section: "operations", allow: canAccessServiceCalls },
  { key: "purchases", label: "Demandes d'achat", path: "/achats", section: "operations", allow: everyone }, // chacun voit au moins ses propres demandes
  { key: "fulfillment", label: "Bons de livraison", path: "/livraisons", section: "operations", allow: canAccessDeliveries },
  // Facturation : Direction et Administration seulement — le Propriétaire en est explicitement exclu (spec confirmée).
  { key: "invoicing", label: "Factures / paiements", path: "/facturation", section: "admin", allow: canCreateInvoiceRecord },
  { key: "contacts", label: "Contacts", path: "/contacts", section: "admin", allow: canAccessOverviewViews },
  { key: "settings", label: "Paramètres", path: "/parametres", section: "admin", allow: canAccessSettings },
];
