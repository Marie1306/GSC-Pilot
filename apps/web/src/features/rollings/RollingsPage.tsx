import { useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { canCreateRollingDirectly, canSeeFinancialValues } from "@gsc-pilot/business-rules";
import { useAuth } from "../../lib/auth/useAuth.js";
import { ListFilterBar } from "../../components/ListFilterBar.js";
import { fetchRollings, formatCurrency, type RollingListItemDto } from "./api.js";
import { RollingDetail } from "./RollingDetail.js";
import { RollingForm } from "./RollingForm.js";
import "./rollings.css";

const STATUS_LABELS: Record<string, string> = { active: "Actif", ready_invoice: "Terminé" };

/** Filtre par numéro/client + tranche de prix vendu (16 novembre 2026, Chantier C Partie B) — pas de champ "nom" (Roulement n'en a pas). */
function matchesFilter(row: RollingListItemDto, search: string, minPrice: string, maxPrice: string): boolean {
  const term = search.trim().toLowerCase();
  if (term) {
    const haystack = [row.rollingNumber, row.company, row.contactName].filter(Boolean).join(" ").toLowerCase();
    if (!haystack.includes(term)) return false;
  }
  if (minPrice && (row.sold === undefined || row.sold < Number(minPrice))) return false;
  if (maxPrice && (row.sold === undefined || row.sold > Number(maxPrice))) return false;
  return true;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("fr-CA", { day: "numeric", month: "short", year: "numeric" });
}

function RollingsTable({ rollings, onOpen }: { rollings: RollingListItemDto[]; onOpen: (id: string) => void }) {
  return (
    <div style={{ overflowX: "auto" }}>
      <table className="shortlist-table">
        <thead>
          <tr>
            <th>Roulement</th>
            <th>Client</th>
            <th className="num">Revenu</th>
            <th>Statut</th>
            <th>Créé le</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {rollings.map((rolling) => (
            <tr key={rolling.id}>
              <td>{rolling.rollingNumber}</td>
              <td>{rolling.company ?? rolling.contactName}</td>
              <td className="num">{rolling.sold !== undefined ? formatCurrency(rolling.sold) : "—"}</td>
              <td>
                <span className={`badge-pill ${rolling.status === "ready_invoice" ? "badge-conforme" : "badge-neutral"}`}>
                  {STATUS_LABELS[rolling.status] ?? rolling.status}
                </span>
              </td>
              <td>{formatDate(rolling.createdAt)}</td>
              <td>
                <button type="button" className="btn btn-secondary btn-small" onClick={() => onOpen(rolling.id)}>
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
 * Roulements (20 août 2026, confirmé) : proviennent en général d'une
 * demande client (via Budgétaire → « Convertir en roulement », voir
 * BudgetDetail.tsx), mais peuvent aussi être créés directement ici —
 * Direction et Propriétaire seulement (canCreateRollingDirectly).
 * Administration garde l'accès à la page pour gérer les roulements déjà
 * créés, sans le bouton de création (spec confirmée le 9 août 2026).
 *
 * Création en fenêtre contextuelle (31 août 2026, demande explicite de
 * l'utilisatrice — auparavant une section intégrée à la page) — voir
 * RollingForm.tsx. ?create=1 (Ajouter rapidement) dérivé de searchParams à
 * chaque rendu — voir ClientRequestsPage.tsx pour l'explication du patron.
 *
 * Séparée en 2 sections sur la même page depuis le 19 octobre 2026 (demande
 * explicite, même traitement que Vente externe) — actifs en haut, terminés
 * (status==="ready_invoice", geste manuel "Terminer le roulement" possible
 * depuis RollingDetail.tsx en plus du cheminement automatique par
 * confirmRollingFulfillment) dans une 2e carte en bas, jamais masqués ni
 * supprimés. archivedAt reste un mécanisme séparé (masque entièrement, voir
 * RollingOptionsMenu.tsx) — un roulement archivé n'apparaît dans aucune des
 * 2 sections ici, inchangé.
 */
export function RollingsPage() {
  const { employee } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const rollingsQuery = useQuery({ queryKey: ["rollings"], queryFn: fetchRollings });
  // ?open=<id> lu une seule fois au montage (même patron que ProjectsPage) — utilisé par Scan QR.
  const [openId, setOpenId] = useState<string | null>(() => searchParams.get("open"));
  const [localShowForm, setLocalShowForm] = useState(false);
  const showForm = localShowForm || searchParams.get("create") === "1";

  function closeForm() {
    setLocalShowForm(false);
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        next.delete("create");
        return next;
      },
      { replace: true },
    );
  }

  const [search, setSearch] = useState("");
  const [minPrice, setMinPrice] = useState("");
  const [maxPrice, setMaxPrice] = useState("");

  if (!employee) return null;
  const canCreate = canCreateRollingDirectly(employee.persona);
  const showPriceFilter = canSeeFinancialValues(employee.persona);
  const rollings = (rollingsQuery.data?.rollings ?? []).filter((row) => matchesFilter(row, search, minPrice, maxPrice));
  const activeRollings = rollings.filter((rolling) => rolling.status !== "ready_invoice");
  const completedRollings = rollings.filter((rolling) => rolling.status === "ready_invoice");

  return (
    <div>
      <div className="card">
        <div className="card-band-header">
          <h3>Roulements</h3>
          {canCreate && (
            <button type="button" className="btn btn-small" onClick={() => setLocalShowForm(true)}>
              + Créer un roulement
            </button>
          )}
        </div>
        <ListFilterBar
          search={search}
          onSearchChange={setSearch}
          searchPlaceholder="Numéro ou client"
          minPrice={minPrice}
          maxPrice={maxPrice}
          onMinPriceChange={showPriceFilter ? setMinPrice : undefined}
          onMaxPriceChange={showPriceFilter ? setMaxPrice : undefined}
        />
        {rollingsQuery.isError ? (
          <p className="form-error">Impossible de charger les roulements.</p>
        ) : activeRollings.length === 0 ? (
          <p style={{ color: "var(--gsc-color-muted)", fontSize: 13 }}>Aucun roulement actif pour l'instant.</p>
        ) : (
          <RollingsTable rollings={activeRollings} onOpen={setOpenId} />
        )}
      </div>

      {completedRollings.length > 0 && (
        <div className="card" style={{ marginTop: 20 }}>
          <div className="card-band-header">
            <h3>Roulements terminés</h3>
          </div>
          <RollingsTable rollings={completedRollings} onOpen={setOpenId} />
        </div>
      )}

      {showForm && canCreate && (
        <RollingForm
          onClose={closeForm}
          onCreated={(id) => {
            closeForm();
            setOpenId(id);
          }}
        />
      )}
      {openId && <RollingDetail id={openId} onClose={() => setOpenId(null)} />}
    </div>
  );
}
