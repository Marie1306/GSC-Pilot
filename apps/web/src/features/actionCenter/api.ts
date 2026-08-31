import { apiFetch } from "../../lib/apiClient.js";

export type ActionItemType =
  | "budget_approval"
  | "purchase_approval"
  | "purchase_to_order"
  | "invoicing"
  | "client_request_new"
  | "client_request_transmitted"
  | "subassembly_ready"
  | "hours_approval"
  | "followup_due";

export interface ActionItemDto {
  id: string;
  type: ActionItemType;
  typeLabel: string;
  label: string;
  sublabel: string;
  amount?: number;
  createdAt: string;
  // Seul subassembly_ready en a besoin (voir linkFor) — son id est celui de
  // l'assemblage (identifiant composé), pas le projet.
  projectId?: string;
}

export function fetchActionCenterItems(): Promise<{ items: ActionItemDto[] }> {
  return apiFetch("/api/action-center/items");
}

// Cible de navigation par type — réutilisée par ActionCenterPage et le
// mini-widget du Tableau de bord, jamais dupliquée. Achats/Facturation
// n'ont pas la convention ?open=<id> (voir ces pages) donc lien vers la
// liste seulement, pas d'ouverture directe inventée ici.
export function linkFor(item: ActionItemDto): string {
  switch (item.type) {
    case "budget_approval":
      return `/budgetaire?open=${item.id}`;
    case "purchase_approval":
    case "purchase_to_order":
      return "/achats";
    case "invoicing":
      return "/facturation";
    case "client_request_new":
    case "client_request_transmitted":
    case "followup_due":
      return `/demandes?open=${item.id}`;
    case "subassembly_ready":
      // projectId toujours présent pour ce type (voir actionCenter/service.ts) —
      // 31 août 2026, corrige le lien qui amenait sur la liste complète des projets.
      return `/projets?open=${item.projectId}`;
    case "hours_approval":
      return "/temps";
  }
}
