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

/** Tableau (17 novembre 2026, demande explicite — même forme que RollingsPage.tsx/RollingsTable, colonnes identiques). */
function ExternalSaleTable({ rows, onOpen }: { rows: ExternalSaleListItemDto[]; onOpen: (id: string) => void }) {
  return (
    <div style={{ overflowX: "auto" }}>
      <table className="shortlist-table">
        <thead>
          <tr>
            <th>Vente</th>
            <th>Client</th>
            <th className="num">Prix vendu</th>
            <th>Statut</th>
            <th>Créé le</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id}>
              <td>{row.displayId}</td>
              <td>{row.company ?? row.contactName}</td>
              <td className="num">{formatCurrency(row.salePrice)}</td>
              <td>
                <span className={`badge-pill ${row.status === "ready_invoice" ? "badge-conforme" : "badge-neutral"}`}>
                  {EXTERNAL_SALE_STATUS_LABELS[row.status] ?? row.status}
                </span>
              </td>
              <td>{formatCalendarDate(row.createdAt)}</td>
              <td>
                <button type="button" className="btn btn-secondary btn-small" onClick={() => onOpen(row.id)}>
                  Ouvrir
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/**
 * Liste des ventes externes (8 septembre 2026) — pas d'onglets de cycle de
 * vie (contrairement à Projet) : une vente reste courte et n'a que 2
 * statuts (voir EXTERNAL_SALE_STATUS_LABELS). Séparée en 2 sections sur la
 * même page depuis le 19 octobre 2026 (demande explicite) — actives en
 * haut, terminées (status==="ready_invoice", voir ExternalSaleDetail.tsx
 * pour le geste "Terminer") dans une 2e carte en bas, jamais masquées ni
 * supprimées. Toujours un onglet unique, pas de tabs — cohérent avec le
 * choix d'origine ci-dessus.
 *
 * Affichage en tableau (17 novembre 2026, demande explicite de
 * l'utilisatrice — « comme le module roulement ») : remplace l'ancienne
 * grille de cartes (ExternalSaleGrid) par ExternalSaleTable, même colonnes
 * exactes que RollingsTable (RollingsPage.tsx) — Vente/Client/Prix
 * vendu/Statut/Créé le/Ouvrir. La colonne "Livraison" de l'ancienne carte
 * est retirée de la liste (cohérent avec Roulement, qui ne l'affiche pas
 * non plus dans son tableau) — reste visible au détail
 * (ExternalSaleFulfillment.tsx), jamais perdue.
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
        {activeRows.length > 0 && <ExternalSaleTable rows={activeRows} onOpen={onOpen} />}
      </div>

      {completedRows.length > 0 && (
        <div className="card" style={{ marginTop: 20 }}>
          <div className="card-band-header">
            <h3>Ventes terminées</h3>
          </div>
          <ExternalSaleTable rows={completedRows} onOpen={onOpen} />
        </div>
      )}
    </>
  );
}
