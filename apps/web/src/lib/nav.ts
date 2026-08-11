import {
  ROLES,
  canAccessBudget,
  canAccessServiceCalls,
  canAccessSettings,
  canAccessOverviewViews,
  canCreateInvoiceRecord,
  canCreateRollingDirectly,
  canViewClientRequests,
  type Persona,
} from "@gsc-pilot/business-rules";

export interface NavItem {
  key: string;
  label: string;
  path: string;
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

/** Toute l'équipe sauf Employé — le Magasinier livre, donc a besoin de voir cette section. Provisoire, voir note ci-dessus. */
const notMemberOnly = (persona: Persona) => persona !== ROLES.MEMBER;

export const NAV_ITEMS: NavItem[] = [
  { key: "dashboard", label: "Tableau de bord", path: "/", allow: everyone },
  { key: "client-requests", label: "Demandes clients", path: "/demandes", allow: canViewClientRequests },
  { key: "budgets", label: "Budgétaire", path: "/budgetaire", allow: canAccessBudget },
  { key: "projects", label: "Projets", path: "/projets", allow: backOfficeOnly },
  // Facturation : Direction et Administration seulement — le Propriétaire en est explicitement exclu (spec confirmée).
  { key: "invoicing", label: "Facturation", path: "/facturation", allow: canCreateInvoiceRecord },
  { key: "purchases", label: "Achats", path: "/achats", allow: everyone }, // chacun voit au moins ses propres demandes
  { key: "time-punch", label: "Temps", path: "/temps", allow: everyone },
  { key: "qr-scan", label: "Scan QR", path: "/scan", allow: everyone },
  { key: "service-calls", label: "Appels de service", path: "/appels-service", allow: canAccessServiceCalls },
  { key: "fulfillment", label: "Livraisons", path: "/livraisons", allow: notMemberOnly },
  // Roulements : Direction/Propriétaire créent, Administration garde l'accès à la page sans le bouton de création (spec confirmée).
  { key: "rollings", label: "Roulements", path: "/roulements", allow: (p) => backOfficeOnly(p) || canCreateRollingDirectly(p) },
  { key: "gantt", label: "Sous-assemblages / Gantt", path: "/gantt", allow: backOfficeOnly },
  { key: "contacts", label: "Contacts", path: "/contacts", allow: canAccessOverviewViews },
  { key: "reports", label: "Rapports", path: "/rapports", allow: canAccessOverviewViews },
  { key: "settings", label: "Paramètres", path: "/parametres", allow: canAccessSettings },
];
