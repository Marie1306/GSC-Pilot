import { apiFetch } from "../../lib/apiClient.js";

export type ActionItemType = "budget_approval" | "purchase_approval" | "invoicing" | "client_request_new" | "client_request_transmitted" | "subassembly_ready";

export interface ActionItemDto {
  id: string;
  type: ActionItemType;
  typeLabel: string;
  label: string;
  sublabel: string;
  amount?: number;
  createdAt: string;
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
      return "/achats";
    case "invoicing":
      return "/facturation";
    case "client_request_new":
    case "client_request_transmitted":
      return `/demandes?open=${item.id}`;
    case "subassembly_ready":
      return "/projets";
  }
}
