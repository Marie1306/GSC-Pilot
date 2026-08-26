import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { canManageWarranty } from "@gsc-pilot/business-rules";
import { useAuth } from "../../lib/auth/useAuth.js";
import { ApiError } from "../../lib/apiClient.js";
import { fetchWarrantyHistory, setWarrantyExpected, activateWarranty, type ProjectDetail } from "./api.js";

interface ProjectWarrantyProps {
  project: ProjectDetail;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("fr-CA", { year: "numeric", month: "short", day: "numeric" });
}

/**
 * Garantie (Projet 2D, 17 août 2026) — deux données indépendantes,
 * confirmées par Q&R : warrantyExpected (case informative, n'active rien
 * seule) et warrantyEndsAt (le vrai interrupteur, avec historique).
 * Direction seulement (canManageWarranty), activable n'importe quand — pas
 * de préalable de production/sortie. Régler une nouvelle fin dans le passé
 * désactive immédiatement (même formulaire, pas de bouton "annuler" séparé).
 */
export function ProjectWarranty({ project }: ProjectWarrantyProps) {
  const { employee } = useAuth();
  const queryClient = useQueryClient();
  const historyQuery = useQuery({ queryKey: ["warranty-history", project.id], queryFn: () => fetchWarrantyHistory(project.id) });
  const [showForm, setShowForm] = useState(false);
  const [endsAt, setEndsAt] = useState("");
  const [reason, setReason] = useState("");
  const [invoiceReference, setInvoiceReference] = useState("");
  const [error, setError] = useState<string | null>(null);

  const invalidate = () => {
    setError(null);
    void queryClient.invalidateQueries({ queryKey: ["warranty-history", project.id] });
    void queryClient.invalidateQueries({ queryKey: ["project", project.id] });
    void queryClient.invalidateQueries({ queryKey: ["projects"] });
  };
  const onMutationError = (err: unknown) => setError(err instanceof ApiError ? err.message : "Une erreur est survenue — réessayez.");

  const expectedMutation = useMutation({
    mutationFn: (expected: boolean) => setWarrantyExpected(project.id, expected),
    onSuccess: invalidate,
    onError: onMutationError,
  });
  const activateMutation = useMutation({
    mutationFn: () => activateWarranty(project.id, { endsAt, reason: reason.trim() || undefined, invoiceReference: invoiceReference.trim() || undefined }),
    onSuccess: () => {
      setShowForm(false);
      setEndsAt("");
      setReason("");
      setInvoiceReference("");
      invalidate();
    },
    onError: onMutationError,
  });

  if (!employee) return null;
  const canManage = canManageWarranty(employee.persona);
  const history = historyQuery.data?.entries ?? [];
  const isActive = project.lifecycleTab === "warranty";

  return (
    <div className="card" style={{ marginBottom: 20 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 10 }}>
        <h3 style={{ margin: 0, fontSize: 15 }}>Garantie</h3>
        {isActive && <span className="badge-pill badge-conforme">En garantie</span>}
      </div>

      <div style={{ marginTop: 14 }}>
        <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13 }}>
          <input
            type="checkbox"
            checked={project.warrantyExpected}
            disabled={!canManage || expectedMutation.isPending}
            onChange={(e) => expectedMutation.mutate(e.target.checked)}
          />
          Ce projet ira en garantie (case informative — n'active rien seule)
        </label>
      </div>

      <div className="stat-tile-grid" style={{ marginTop: 14, marginBottom: 0 }}>
        <div className="stat-tile">
          <span className="stat-tile-label">Statut</span>
          <span className="stat-tile-value">{isActive ? "En garantie" : project.warrantyEndsAt ? "Garantie expirée" : "Pas en garantie"}</span>
        </div>
        {project.warrantyEndsAt && (
          <div className="stat-tile">
            <span className="stat-tile-label">Fin de garantie</span>
            <span className="stat-tile-value">{formatDate(project.warrantyEndsAt)}</span>
          </div>
        )}
      </div>

      {error && <p className="form-error">{error}</p>}

      {canManage && !showForm && (
        <div style={{ marginTop: 14 }}>
          <button type="button" className="btn btn-small" onClick={() => setShowForm(true)}>
            {project.warrantyEndsAt ? "Modifier la garantie" : "Activer la garantie"}
          </button>
        </div>
      )}

      {showForm && (
        <form
          className="form-grid"
          style={{ marginTop: 14 }}
          onSubmit={(event) => {
            event.preventDefault();
            if (endsAt) activateMutation.mutate();
          }}
        >
          <div className="field">
            <label>Date de fin de garantie</label>
            <input type="date" value={endsAt} onChange={(e) => setEndsAt(e.target.value)} required />
          </div>
          <div className="field">
            <label>Motif (facultatif)</label>
            <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="ex. garantie 2 ans à l'installation" />
          </div>
          <div className="field field-full">
            <label>Référence de facture (facultatif — rare)</label>
            <input
              value={invoiceReference}
              onChange={(e) => setInvoiceReference(e.target.value)}
              placeholder="ex. FA-2026-0140, si une facture distincte s'applique"
            />
          </div>
          <div className="field field-full" style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button type="submit" className="btn btn-small" disabled={!endsAt || activateMutation.isPending}>
              {activateMutation.isPending ? "…" : "Enregistrer"}
            </button>
            <button type="button" className="btn btn-secondary btn-small" onClick={() => setShowForm(false)}>
              Annuler
            </button>
          </div>
        </form>
      )}

      {history.length > 0 && (
        <div style={{ marginTop: 18, overflowX: "auto" }}>
          <h4 style={{ fontSize: 13, margin: "0 0 8px", color: "var(--gsc-color-muted)" }}>Historique</h4>
          <table className="shortlist-table">
            <thead>
              <tr>
                <th>Ancienne fin</th>
                <th>Nouvelle fin</th>
                <th>Motif</th>
                <th>Facture</th>
                <th>Par</th>
                <th>Date</th>
              </tr>
            </thead>
            <tbody>
              {history.map((entry) => (
                <tr key={entry.id}>
                  <td>{entry.previousEndsAt ? formatDate(entry.previousEndsAt) : "—"}</td>
                  <td>{formatDate(entry.newEndsAt)}</td>
                  <td>{entry.reason ?? "—"}</td>
                  <td>{entry.invoiceReference ?? "—"}</td>
                  <td>{entry.changedByName}</td>
                  <td>{formatDate(entry.changedAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
