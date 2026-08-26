import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { canCreateRollingDirectly } from "@gsc-pilot/business-rules";
import { useAuth } from "../../lib/auth/useAuth.js";
import { ApiError } from "../../lib/apiClient.js";
import { fetchRollings, createRollingDirect, formatCurrency } from "./api.js";
import { RollingDetail } from "./RollingDetail.js";
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
 */
export function RollingsPage() {
  const { employee } = useAuth();
  const queryClient = useQueryClient();
  const rollingsQuery = useQuery({ queryKey: ["rollings"], queryFn: fetchRollings });
  const [openId, setOpenId] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [contactName, setContactName] = useState("");
  const [company, setCompany] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);

  const createMutation = useMutation({
    mutationFn: () =>
      createRollingDirect({
        contactName: contactName.trim(),
        company: company.trim() || undefined,
        phone: phone.trim() || undefined,
        email: email.trim() || undefined,
      }),
    onSuccess: ({ rolling }) => {
      setShowForm(false);
      setContactName("");
      setCompany("");
      setPhone("");
      setEmail("");
      setError(null);
      void queryClient.invalidateQueries({ queryKey: ["rollings"] });
      setOpenId(rolling.id);
    },
    onError: (err: unknown) => setError(err instanceof ApiError ? err.message : "Une erreur est survenue — réessayez."),
  });

  if (!employee) return null;
  const canCreate = canCreateRollingDirectly(employee.persona);
  const rollings = rollingsQuery.data?.rollings ?? [];

  return (
    <div>
      {showForm && canCreate && (
        <div className="card">
          <h3 style={{ marginTop: 0, fontSize: 15 }}>Nouveau roulement</h3>
          <form
            className="form-grid"
            onSubmit={(event) => {
              event.preventDefault();
              if (!contactName.trim()) return;
              createMutation.mutate();
            }}
          >
            <div className="field">
              <label>Nom du contact</label>
              <input value={contactName} onChange={(e) => setContactName(e.target.value)} autoFocus />
            </div>
            <div className="field">
              <label>Entreprise (facultatif)</label>
              <input value={company} onChange={(e) => setCompany(e.target.value)} />
            </div>
            <div className="field">
              <label>Téléphone (facultatif)</label>
              <input value={phone} onChange={(e) => setPhone(e.target.value)} />
            </div>
            <div className="field">
              <label>Courriel (facultatif)</label>
              <input value={email} onChange={(e) => setEmail(e.target.value)} />
            </div>
            <div className="field field-full" style={{ display: "flex", gap: 8 }}>
              <button type="submit" className="btn btn-small" disabled={!contactName.trim() || createMutation.isPending}>
                {createMutation.isPending ? "Création…" : "Créer"}
              </button>
              <button type="button" className="btn btn-secondary btn-small" onClick={() => setShowForm(false)}>
                Annuler
              </button>
            </div>
          </form>
          {error && <p className="form-error">{error}</p>}
        </div>
      )}

      <div className="card" style={{ marginTop: showForm && canCreate ? 20 : 0 }}>
        <div className="card-band-header">
          <h3>Roulements</h3>
          {canCreate && !showForm && (
            <button type="button" className="btn btn-small" onClick={() => setShowForm(true)}>
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

      {openId && <RollingDetail id={openId} onClose={() => setOpenId(null)} />}
    </div>
  );
}
