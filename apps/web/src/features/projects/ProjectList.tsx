import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { canCreateProjectDirectly, canSeeFinancialValues } from "@gsc-pilot/business-rules";
import { useAuth } from "../../lib/auth/useAuth.js";
import { ListFilterBar } from "../../components/ListFilterBar.js";
import { fetchProjects, STATUS_LABELS, FINANCIAL_STATUS_LABELS, LIFECYCLE_TAB_LABELS, type ProjectLifecycleTab, type ProjectListItem } from "./api.js";

interface ProjectListProps {
  onOpen: (id: string) => void;
  onCreate: () => void;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("fr-CA", { month: "short", day: "numeric" });
}

const TABS: ProjectLifecycleTab[] = ["active", "warranty", "closed"];

/** Filtre par numéro/nom/client + tranche de prix vendu (16 novembre 2026, Chantier C Partie B). */
function matchesFilter(row: ProjectListItem, search: string, minPrice: string, maxPrice: string): boolean {
  const term = search.trim().toLowerCase();
  if (term) {
    const haystack = [row.projectNumber, row.name, row.company, row.contactName].filter(Boolean).join(" ").toLowerCase();
    if (!haystack.includes(term)) return false;
  }
  if (minPrice && (row.sold === undefined || row.sold < Number(minPrice))) return false;
  if (maxPrice && (row.sold === undefined || row.sold > Number(maxPrice))) return false;
  return true;
}

/**
 * Onglets Actifs/Garantie/Fermés (Projet 2D, 17 août 2026) — dérivés côté
 * serveur (lifecycleTab, warranty.ts), jamais un filtre par requête séparée
 * : la liste complète est chargée une fois, filtrée ici par onglet.
 */
export function ProjectList({ onOpen, onCreate }: ProjectListProps) {
  const { employee } = useAuth();
  const listQuery = useQuery({ queryKey: ["projects"], queryFn: fetchProjects });
  const [tab, setTab] = useState<ProjectLifecycleTab>("active");
  const [search, setSearch] = useState("");
  const [minPrice, setMinPrice] = useState("");
  const [maxPrice, setMaxPrice] = useState("");
  const allRows = (listQuery.data?.projects ?? []).filter((row) => matchesFilter(row, search, minPrice, maxPrice));
  const rows = allRows.filter((row) => row.lifecycleTab === tab);
  // Champs prix min/max omis si le rôle ne voit pas sold (sinon tout
  // exclu dès qu'une valeur est tapée, sold étant toujours undefined).
  const showPriceFilter = !!employee && canSeeFinancialValues(employee.persona);

  return (
    <div className="card" style={{ marginTop: 20 }}>
      <div className="card-band-header">
        <h3>Projets</h3>
        {employee && canCreateProjectDirectly(employee.persona) && (
          <button type="button" className="btn" onClick={onCreate}>
            + Nouveau projet
          </button>
        )}
      </div>
      <ListFilterBar
        search={search}
        onSearchChange={setSearch}
        searchPlaceholder="Numéro, nom ou client"
        minPrice={minPrice}
        maxPrice={maxPrice}
        onMinPriceChange={showPriceFilter ? setMinPrice : undefined}
        onMaxPriceChange={showPriceFilter ? setMaxPrice : undefined}
      />
      <div style={{ display: "flex", gap: 8, margin: "0 0 16px" }}>
        {TABS.map((t) => (
          <button
            key={t}
            type="button"
            className={`btn btn-small ${tab === t ? "" : "btn-secondary"}`}
            onClick={() => setTab(t)}
          >
            {LIFECYCLE_TAB_LABELS[t]} ({allRows.filter((row) => row.lifecycleTab === t).length})
          </button>
        ))}
      </div>
      {rows.length === 0 && <p style={{ color: "var(--gsc-color-muted)", fontSize: 13 }}>Aucun projet dans cet onglet.</p>}
      {rows.length > 0 && (
        <div className="project-card-grid">
          {rows.map((row) => (
            <div key={row.id} className="project-card" onClick={() => onOpen(row.id)}>
              <div className="project-card-header">
                <span className="project-card-number">{row.projectNumber}</span>
                {row.financialStatus && (
                  <span className={`badge-pill badge-${row.financialStatus}`}>{FINANCIAL_STATUS_LABELS[row.financialStatus]}</span>
                )}
              </div>
              <div className="project-card-name">{row.name}</div>
              <div className="project-card-sub">
                {row.company ?? row.contactName}
                {row.deadline && <> · Échéance {formatDate(row.deadline)}</>}
                {row.lifecycleTab === "warranty" && row.warrantyEndsAt && <> · Fin de garantie {formatDate(row.warrantyEndsAt)}</>}
              </div>

              <div className="project-card-stats">
                <div className="stat-tile">
                  <span className="stat-tile-label">Avancement</span>
                  <span className="stat-tile-value">{row.progressionPct !== undefined ? `${row.progressionPct} %` : "—"}</span>
                </div>
                <div className="stat-tile">
                  <span className="stat-tile-label">Heures réelles</span>
                  <span className="stat-tile-value">{row.hoursUsedPct} %</span>
                </div>
                <div className="stat-tile">
                  <span className="stat-tile-label">Marge réelle</span>
                  <span className="stat-tile-value">{row.grossMarginPct !== undefined ? `${row.grossMarginPct} %` : "—"}</span>
                </div>
              </div>

              {row.progressionPct !== undefined && (
                <div style={{ marginBottom: 14 }}>
                  <div className="progress-row">
                    <span style={{ color: "var(--gsc-color-muted)" }}>Progression du projet</span>
                    <strong>{row.progressionPct} %</strong>
                  </div>
                  <div className="progress-track">
                    <div className="progress-fill" style={{ width: `${Math.min(100, Math.max(0, row.progressionPct))}%` }} />
                  </div>
                </div>
              )}

              <div className="project-card-footer">
                <span>{STATUS_LABELS[row.status] ?? row.status}</span>
                <span className="project-card-open">Ouvrir ›</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
