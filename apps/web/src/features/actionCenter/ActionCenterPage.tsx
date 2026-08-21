import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { formatCurrency } from "../projects/api.js";
import { fetchActionCenterItems, type ActionItemDto, type ActionItemType } from "./api.js";
import "./actionCenter.css";

// Cible de navigation par type — réutilise la convention ?open=<id> déjà
// câblée dans BudgetsPage/ClientRequestsPage ; Achats/Facturation n'ont pas
// cette convention (voir ces pages) donc lien vers la liste seulement, pas
// d'ouverture directe inventée ici.
function linkFor(item: ActionItemDto): string {
  switch (item.type) {
    case "budget_approval":
      return `/budgetaire?open=${item.id}`;
    case "purchase_approval":
      return "/achats";
    case "invoicing":
      return "/facturation";
    case "client_request_transmitted":
      return `/demandes?open=${item.id}`;
  }
}

const TYPE_ORDER: ActionItemType[] = ["budget_approval", "purchase_approval", "invoicing", "client_request_transmitted"];

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("fr-CA", { year: "numeric", month: "short", day: "numeric" });
}

/**
 * Centre d'actions (21 août 2026, spec confirmée) — point central pour
 * Direction/Administration/Propriétaire : agrège les items déjà calculés
 * par action-center/service.ts (chaque type rejoue la vraie règle
 * d'autorisation de son module d'origine, jamais une approximation ici).
 */
export function ActionCenterPage() {
  const itemsQuery = useQuery({ queryKey: ["action-center", "items"], queryFn: fetchActionCenterItems });
  const items = itemsQuery.data?.items ?? [];

  const groups = TYPE_ORDER.map((type) => ({ type, items: items.filter((item) => item.type === type) })).filter(
    (group) => group.items.length > 0,
  );

  return (
    <div>
      <div className="card">
        <h1 style={{ marginTop: 0, fontSize: 20 }}>Centre d'actions</h1>
        <p style={{ color: "var(--gsc-color-muted)", margin: 0 }}>
          Tout ce qui attend un traitement ou une approbation de votre part, tous modules confondus.
        </p>
      </div>

      {itemsQuery.isError && (
        <div className="card" style={{ marginTop: 20 }}>
          <p className="form-error">Impossible de charger le centre d'actions.</p>
        </div>
      )}

      {itemsQuery.isSuccess && groups.length === 0 && (
        <div className="card" style={{ marginTop: 20 }}>
          <p style={{ color: "var(--gsc-color-muted)", fontSize: 13 }}>Rien à traiter pour l'instant.</p>
        </div>
      )}

      {groups.map((group) => (
        <div key={group.type} className="card" style={{ marginTop: 20 }}>
          <div className="section-heading">
            <h3>
              {group.items[0]?.typeLabel} <span className="cell-sub">({group.items.length})</span>
            </h3>
          </div>
          <div className="action-item-list">
            {group.items.map((item) => (
              <Link key={item.id} to={linkFor(item)} className="action-item-row">
                <div className="action-item-main">
                  <span className="action-item-label">{item.label}</span>
                  <span className="action-item-sublabel">{item.sublabel}</span>
                </div>
                <div className="action-item-side">
                  {item.amount !== undefined && <span className="action-item-amount">{formatCurrency(item.amount)}</span>}
                  <span className="action-item-date">{formatDate(item.createdAt)}</span>
                </div>
              </Link>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
