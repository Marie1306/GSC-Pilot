import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { canCreateServiceCall, canSeeServicePricing } from "@gsc-pilot/business-rules";
import { useAuth } from "../../lib/auth/useAuth.js";
import { ListFilterBar } from "../../components/ListFilterBar.js";
import { fetchServiceCalls, type ServiceCallListItemDto } from "./api.js";
import "./serviceCalls.css";

interface ServiceCallListProps {
  onOpen: (id: string) => void;
  onCreate: () => void;
}

const STATUS_LABELS: Record<string, string> = { scheduled: "Planifié", approved: "Approuvé" };

const currencyFormatter = new Intl.NumberFormat("fr-CA", { style: "currency", currency: "CAD" });
function formatCurrency(value: number): string {
  return currencyFormatter.format(value);
}

function formatDate(iso: string | null): string {
  return iso ? new Date(iso).toLocaleDateString("fr-CA", { day: "numeric", month: "short" }) : "—";
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

export function ServiceCallList({ onOpen, onCreate }: ServiceCallListProps) {
  const { employee } = useAuth();
  const [search, setSearch] = useState("");
  const [minPrice, setMinPrice] = useState("");
  const [maxPrice, setMaxPrice] = useState("");
  const listQuery = useQuery({ queryKey: ["service-calls"], queryFn: fetchServiceCalls });
  const rows = (listQuery.data?.serviceCalls ?? []).filter((row) => matchesFilter(row, search, minPrice, maxPrice));
  const canCreate = employee ? canCreateServiceCall(employee.persona) : false;
  const showPriceFilter = !!employee && canSeeServicePricing(employee.persona);

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
        <div style={{ overflowX: "auto" }}>
          <table className="service-call-table">
            <thead>
              <tr>
                <th>Call</th>
                <th>Client</th>
                <th>Titre</th>
                <th>Assigné à</th>
                <th>Prévu</th>
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
                  <td>{formatDate(row.scheduledAt)}</td>
                  <td>
                    <span className={`badge-pill ${row.status === "approved" ? "badge-conforme" : "badge-neutral"}`}>
                      {STATUS_LABELS[row.status] ?? row.status}
                    </span>
                  </td>
                  {showPriceFilter && <td className="num">{row.salePrice !== undefined ? formatCurrency(row.salePrice) : "—"}</td>}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
