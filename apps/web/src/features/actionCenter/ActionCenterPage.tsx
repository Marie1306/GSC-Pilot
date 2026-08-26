import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { formatCurrency } from "../projects/api.js";
import { fetchActionCenterItems, linkFor, type ActionItemDto, type ActionItemType } from "./api.js";
import { BudgetDetail } from "../budgets/BudgetDetail.js";
import { ClientRequestDetail } from "../clientRequests/ClientRequestDetail.js";
import { PurchaseRequestActionDrawer } from "../purchases/PurchaseRequestActionDrawer.js";
import { InvoiceActionDrawer } from "../invoicing/InvoiceActionDrawer.js";
import { TimeEntryActionDrawer } from "../timePunch/TimeEntryActionDrawer.js";
import "./actionCenter.css";

const TYPE_ORDER: ActionItemType[] = [
  "client_request_new",
  "budget_approval",
  "hours_approval",
  "purchase_approval",
  "purchase_to_order",
  "invoicing",
  "client_request_transmitted",
  "subassembly_ready",
];

// Types qui ouvrent directement le détail + les actions réelles sans
// quitter le Centre d'actions (25 août 2026, demande explicite) — chacun
// réutilise le composant déjà construit et vérifié de son propre module,
// jamais une deuxième logique d'approbation ici. subassembly_ready et
// purchase_to_order restent une navigation classique : leur suivi (créer la
// liste de pièces ; fixer la date, marquer commandé/reçu, appliquer au
// projet) vit en profondeur dans l'écran de son module, pas extractible
// proprement dans un tiroir sans dupliquer cet écran (26 août 2026, même
// principe que subassembly_ready).
function hasActionDrawer(type: ActionItemType): boolean {
  return type !== "subassembly_ready" && type !== "purchase_to_order";
}

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
  const [openItem, setOpenItem] = useState<ActionItemDto | null>(null);

  const groups = TYPE_ORDER.map((type) => ({ type, items: items.filter((item) => item.type === type) })).filter(
    (group) => group.items.length > 0,
  );

  return (
    <div>
      {itemsQuery.isError && (
        <div className="card">
          <p className="form-error">Impossible de charger le centre d'actions.</p>
        </div>
      )}

      {itemsQuery.isSuccess && groups.length === 0 && (
        <div className="card">
          <p style={{ color: "var(--gsc-color-muted)", fontSize: 13 }}>Rien à traiter pour l'instant.</p>
        </div>
      )}

      {groups.map((group, index) => (
        <div key={group.type} className="card" style={{ marginTop: index === 0 ? 0 : 20 }}>
          <div className="card-band-header">
            <h3>
              {group.items[0]?.typeLabel} <span className="cell-sub">({group.items.length})</span>
            </h3>
          </div>
          <div className="action-item-list">
            {group.items.map((item) =>
              hasActionDrawer(item.type) ? (
                <button key={item.id} type="button" className="action-item-row" onClick={() => setOpenItem(item)}>
                  <div className="action-item-main">
                    <span className="action-item-label">{item.label}</span>
                    <span className="action-item-sublabel">{item.sublabel}</span>
                  </div>
                  <div className="action-item-side">
                    {item.amount !== undefined && <span className="action-item-amount">{formatCurrency(item.amount)}</span>}
                    <span className="action-item-date">{formatDate(item.createdAt)}</span>
                  </div>
                </button>
              ) : (
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
              ),
            )}
          </div>
        </div>
      ))}

      {openItem?.type === "budget_approval" && <BudgetDetail id={openItem.id} onClose={() => setOpenItem(null)} />}
      {(openItem?.type === "client_request_new" || openItem?.type === "client_request_transmitted") && (
        <ClientRequestDetail id={openItem.id} onClose={() => setOpenItem(null)} />
      )}
      {openItem?.type === "purchase_approval" && <PurchaseRequestActionDrawer id={openItem.id} onClose={() => setOpenItem(null)} />}
      {openItem?.type === "invoicing" && <InvoiceActionDrawer id={openItem.id} onClose={() => setOpenItem(null)} />}
      {openItem?.type === "hours_approval" && <TimeEntryActionDrawer id={openItem.id} onClose={() => setOpenItem(null)} />}
    </div>
  );
}
