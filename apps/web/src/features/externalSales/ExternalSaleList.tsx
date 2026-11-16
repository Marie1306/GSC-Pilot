import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { canManageExternalSales } from "@gsc-pilot/business-rules";
import { useAuth } from "../../lib/auth/useAuth.js";
import { formatCalendarDate } from "../../lib/date.js";
import { ListFilterBar } from "../../components/ListFilterBar.js";
import { fetchExternalSales, formatCurrency, EXTERNAL_SALE_STATUS_LABELS, type ExternalSaleListItemDto } from "./api.js";

/** Filtre par numéro/client + tranche de prix vendu (16 novembre 2026, Chantier C Partie B) — pas de champ "nom" (Vente externe n'en a pas). */
function matchesFilter(row: ExternalSaleListItemDto, search: string, minPrice: string, maxPrice: string): boolean {
  const term = search.trim().toLowerCase();
  if (term) {
    const haystack = [row.displayId, row.company, row.contactName].filter(Boolean).join(" ").toLowerCase();
    if (!haystack.includes(term)) return false;
  }
  if (minPrice && row.salePrice < Number(minPrice)) return false;
  if (maxPrice && row.salePrice > Number(maxPrice)) return false;
  return true;
}

interface ExternalSaleListProps {
  onOpen: (id: string) => void;
  onCreate: () => void;
}

function ExternalSaleGrid({ rows, onOpen }: { rows: ExternalSaleListItemDto[]; onOpen: (id: string) => void }) {
  return (
    <div className="project-card-grid">
      {rows.map((row) => (
        <div key={row.id} className="project-card" onClick={() => onOpen(row.id)}>
          <div className="project-card-header">
            <span className="project-card-number">{row.displayId}</span>
            <span className={`badge-pill ${row.status === "ready_invoice" ? "badge-conforme" : "badge-neutral"}`}>
              {EXTERNAL_SALE_STATUS_LABELS[row.status] ?? row.status}
            </span>
          </div>
          <div className="project-card-name">{row.company ?? row.contactName}</div>
          <div className="project-card-sub">{formatCalendarDate(row.createdAt)}</div>

          <div className="project-card-stats">
            <div className="stat-tile">
              <span className="stat-tile-label">Prix vendu</span>
              <span className="stat-tile-value">{formatCurrency(row.salePrice)}</span>
            </div>
            <div className="stat-tile">
              <span className="stat-tile-label">Livraison</span>
              <span className="stat-tile-value">{row.readyToDeliver ? "Prête" : "En attente"}</span>
            </div>
          </div>

          <div className="project-card-footer">
            <span />
            <span className="project-card-open">Ouvrir ›</span>
          </div>
        </div>
      ))}
    </div>
  );
}

/**
 * Liste des ventes externes (8 septembre 2026) — pas d'onglets de cycle de
 * vie (contrairement à Projet) : une vente reste courte et n'a que 2
 * statuts (voir EXTERNAL_SALE_STATUS_LABELS). Séparée en 2 sections sur la
 * même page depuis le 19 octobre 2026 (demande explicite) — actives en
 * haut (carte existante), terminées (status==="ready_invoice", voir
 * ExternalSaleDetail.tsx pour le geste "Terminer") dans une 2e carte en
 * bas, jamais masquées ni supprimées. Toujours un onglet unique, pas de
 * tabs — cohérent avec le choix d'origine ci-dessus.
 */
export function ExternalSaleList({ onOpen, onCreate }: ExternalSaleListProps) {
  const { employee } = useAuth();
  const [search, setSearch] = useState("");
  const [minPrice, setMinPrice] = useState("");
  const [maxPrice, setMaxPrice] = useState("");
  const listQuery = useQuery({ queryKey: ["external-sales"], queryFn: fetchExternalSales });
  const rows = (listQuery.data?.externalSales ?? []).filter((row) => matchesFilter(row, search, minPrice, maxPrice));
  const activeRows = rows.filter((row) => row.status !== "ready_invoice");
  const completedRows = rows.filter((row) => row.status === "ready_invoice");

  return (
    <>
      <div className="card" style={{ marginTop: 20 }}>
        <div className="card-band-header">
          <h3>Ventes externes</h3>
          {employee && canManageExternalSales(employee.persona) && (
            <button type="button" className="btn" onClick={onCreate}>
              + Nouvelle vente
            </button>
          )}
        </div>
        <ListFilterBar
          search={search}
          onSearchChange={setSearch}
          searchPlaceholder="Numéro ou client"
          minPrice={minPrice}
          maxPrice={maxPrice}
          onMinPriceChange={setMinPrice}
          onMaxPriceChange={setMaxPrice}
        />
        {activeRows.length === 0 && <p style={{ color: "var(--gsc-color-muted)", fontSize: 13 }}>Aucune vente externe active.</p>}
        {activeRows.length > 0 && <ExternalSaleGrid rows={activeRows} onOpen={onOpen} />}
      </div>

      {completedRows.length > 0 && (
        <div className="card" style={{ marginTop: 20 }}>
          <div className="card-band-header">
            <h3>Ventes terminées</h3>
          </div>
          <ExternalSaleGrid rows={completedRows} onOpen={onOpen} />
        </div>
      )}
    </>
  );
}
