import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { canCreateServiceCall, canSeeServicePricing } from "@gsc-pilot/business-rules";
import { useAuth } from "../../lib/auth/useAuth.js";
import { ListFilterBar } from "../../components/ListFilterBar.js";
import { fetchServiceCalls, SERVICE_CALL_STATUS_LABELS, type ServiceCallListItemDto } from "./api.js";
import "./serviceCalls.css";

interface ServiceCallListProps {
  onOpen: (id: string) => void;
  onCreate: () => void;
}

const currencyFormatter = new Intl.NumberFormat("fr-CA", { style: "currency", currency: "CAD" });
function formatCurrency(value: number): string {
  return currencyFormatter.format(value);
}

/** Filtre par numéro/titre/client + tranche de prix vendu (16 novembre 2026, Chantier C Partie B). */
function matchesFilter(row: ServiceCallListItemDto, search: string, minPrice: string, maxPrice: string): boolean {
  const term = search.trim().toLowerCase();
  if (term) {
    const haystack = [row.displayId, row.title, row.company, row.contactName].filter(Boolean).join(" ").toLowerCase();
    if (!haystack.includes(term)) return false;
  }
  if (minPrice && (row.salePrice === undefined || row.salePrice < Number(minPrice))) return false;
  if (maxPrice && (row.salePrice === undefined || row.salePrice > Number(maxPrice))) return false;
  return true;
}

function ServiceCallTable({
  rows,
  onOpen,
  showPriceFilter,
}: {
  rows: ServiceCallListItemDto[];
  onOpen: (id: string) => void;
  showPriceFilter: boolean;
}) {
  return (
    <div style={{ overflowX: "auto" }}>
      <table className="service-call-table">
        <thead>
          <tr>
            <th>Call</th>
            <th>Client</th>
            <th>Titre</th>
            <th>Assigné à</th>
            <th>Bons de travail</th>
            <th>Statut</th>
            {showPriceFilter && <th className="num">Prix vendu</th>}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 && (
            <tr>
              <td colSpan={showPriceFilter ? 7 : 6} style={{ color: "var(--gsc-color-muted)" }}>
                Aucun appel de service pour l'instant.
              </td>
            </tr>
          )}
          {rows.map((row) => (
            <tr key={row.id} onClick={() => onOpen(row.id)} style={{ cursor: "pointer" }}>
              <td>{row.displayId}</td>
              <td>{row.company ?? row.contactName}</td>
              <td>{row.title}</td>
              <td>{row.assignedEmployees.length > 0 ? row.assignedEmployees.map((employee) => employee.name).join(", ") : "—"}</td>
              <td>{row.bonsDeTravailCount}</td>
              <td>
                <span className={`badge-pill ${row.derivedStatus === "invoiced" ? "badge-conforme" : "badge-neutral"}`}>
                  {SERVICE_CALL_STATUS_LABELS[row.derivedStatus]}
                </span>
              </td>
              {showPriceFilter && <td className="num">{row.salePrice !== undefined ? formatCurrency(row.salePrice) : "—"}</td>}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/**
 * Appels de service (Chantier D, 16 novembre 2026 — refonte complète en
 * dossier + Bons de travail). Séparés en 2 sections comme Roulement/Vente
 * externe depuis cette refonte : actifs en haut, terminés
 * (derivedStatus==="invoiced", tous les BT approuvés sont facturés) dans
 * une 2e carte en bas, jamais masqués ni supprimés — cohérence proposée
 * avec ces 2 autres modules à statut de fin de cycle, confirmée en revue
 * de plan.
 */
export function ServiceCallList({ onOpen, onCreate }: ServiceCallListProps) {
  const { employee } = useAuth();
  const [search, setSearch] = useState("");
  const [minPrice, setMinPrice] = useState("");
  const [maxPrice, setMaxPrice] = useState("");
  const listQuery = useQuery({ queryKey: ["service-calls"], queryFn: fetchServiceCalls });
  const rows = (listQuery.data?.serviceCalls ?? []).filter((row) => matchesFilter(row, search, minPrice, maxPrice));
  const canCreate = employee ? canCreateServiceCall(employee.persona) : false;
  const showPriceFilter = !!employee && canSeeServicePricing(employee.persona);
  const activeRows = rows.filter((row) => row.derivedStatus !== "invoiced");
  const completedRows = rows.filter((row) => row.derivedStatus === "invoiced");

  return (
    <div>
      <section className="card">
        <div className="card-band-header">
          <h3>Appels de service</h3>
          {canCreate && (
            <button type="button" className="btn" onClick={onCreate}>
              + Nouvel appel
            </button>
          )}
        </div>
        <ListFilterBar
          search={search}
          onSearchChange={setSearch}
          searchPlaceholder="Numéro, titre ou client"
          minPrice={minPrice}
          maxPrice={maxPrice}
          onMinPriceChange={showPriceFilter ? setMinPrice : undefined}
          onMaxPriceChange={showPriceFilter ? setMaxPrice : undefined}
        />
        <ServiceCallTable rows={activeRows} onOpen={onOpen} showPriceFilter={showPriceFilter} />
      </section>

      {completedRows.length > 0 && (
        <section className="card" style={{ marginTop: 20 }}>
          <div className="card-band-header">
            <h3>Appels terminés</h3>
          </div>
          <ServiceCallTable rows={completedRows} onOpen={onOpen} showPriceFilter={showPriceFilter} />
        </section>
      )}
    </div>
  );
}
