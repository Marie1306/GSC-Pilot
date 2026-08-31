import { useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { canCreateRollingDirectly } from "@gsc-pilot/business-rules";
import { useAuth } from "../../lib/auth/useAuth.js";
import { fetchRollings, formatCurrency } from "./api.js";
import { RollingDetail } from "./RollingDetail.js";
import { RollingForm } from "./RollingForm.js";
import "./rollings.css";

const STATUS_LABELS: Record<string, string> = { active: "Actif", ready_invoice: "Terminé" };

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("fr-CA", { day: "numeric", month: "short", year: "numeric" });
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

  if (!employee) return null;
  const canCreate = canCreateRollingDirectly(employee.persona);
  const rollings = rollingsQuery.data?.rollings ?? [];

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
        {rollingsQuery.isError ? (
          <p className="form-error">Impossible de charger les roulements.</p>
        ) : rollings.length === 0 ? (
          <p style={{ color: "var(--gsc-color-muted)", fontSize: 13 }}>Aucun roulement pour l'instant.</p>
        ) : (
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
                      <button type="button" className="btn btn-secondary btn-small" onClick={() => setOpenId(rolling.id)}>
                        Ouvrir
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {showForm && canCreate && (
        <RollingForm
          persona={employee.persona}
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
