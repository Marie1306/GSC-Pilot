import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { canEnterProjectPurchase, canApproveProjectPurchase } from "@gsc-pilot/business-rules";
import { useAuth } from "../../lib/auth/useAuth.js";
import { ApiError } from "../../lib/apiClient.js";
import {
  fetchProjectPurchaseEntries,
  createProjectPurchaseEntry,
  updateProjectPurchaseEntryAmount,
  deleteProjectPurchaseEntry,
  approveProjectPurchaseEntry,
  fetchPurchaseCategories,
  formatCurrency,
  type ProjectPurchaseEntryDto,
} from "../purchases/api.js";
import { ApprovedPurchasesDrilldown } from "./ApprovedPurchasesDrilldown.js";

interface ProjectPurchaseEntriesProps {
  projectId: string;
  projectLabel: string;
  /** Incrémenté par ProjectDetail quand "Ajouter un achat" est choisi depuis le menu Options (composant frère, pas parent) — ouvre la modale sans dupliquer l'état showForm. */
  openSignal?: number;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("fr-CA", { year: "numeric", month: "short", day: "numeric" });
}

const emptyForm = { date: new Date().toISOString().slice(0, 10), category: "", supplier: "", description: "", amount: "", note: "" };

/**
 * Achats réels du projet — mécanisme simple ProjectPurchaseEntry (Projet 2B,
 * 17 août 2026), distinct des Demandes d'achat (module Achats, PurchaseRequest,
 * son propre workflow à seuils). Saisie Administration/Direction
 * (canEnterProjectPurchase), approbation Direction seulement
 * (canApproveProjectPurchase, avec délégation). Correction du montant et
 * suppression permises tant qu'en attente seulement — jamais après
 * approbation (confirmé le 17 août 2026, aucun statut "rejeté").
 */
export function ProjectPurchaseEntries({ projectId, projectLabel, openSignal }: ProjectPurchaseEntriesProps) {
  const { employee } = useAuth();
  const queryClient = useQueryClient();
  const entriesQuery = useQuery({ queryKey: ["project-purchase-entries", projectId], queryFn: () => fetchProjectPurchaseEntries(projectId) });
  const categoriesQuery = useQuery({ queryKey: ["purchase-categories"], queryFn: fetchPurchaseCategories });
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [amountDrafts, setAmountDrafts] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);

  // Ouvre la modale depuis le signal externe (menu Options) — ajustement
  // pendant le rendu plutôt qu'un effect (recommandation React : éviter
  // setState synchrone dans un effect, voir react-hooks/set-state-in-effect).
  const [lastOpenSignal, setLastOpenSignal] = useState(openSignal);
  if (openSignal !== lastOpenSignal) {
    setLastOpenSignal(openSignal);
    if (openSignal) setShowForm(true);
  }

  const invalidate = () => {
    setError(null);
    void queryClient.invalidateQueries({ queryKey: ["project-purchase-entries", projectId] });
    void queryClient.invalidateQueries({ queryKey: ["project", projectId] });
    void queryClient.invalidateQueries({ queryKey: ["projects"] });
  };
  const onMutationError = (err: unknown) => setError(err instanceof ApiError ? err.message : "Une erreur est survenue — réessayez.");

  const createMutation = useMutation({
    mutationFn: () =>
      createProjectPurchaseEntry(projectId, {
        date: form.date,
        category: form.category.trim(),
        supplier: form.supplier.trim() || undefined,
        description: form.description.trim(),
        amount: Number(form.amount),
        note: form.note.trim() || undefined,
      }),
    onSuccess: () => {
      setForm(emptyForm);
      setShowForm(false);
      invalidate();
    },
    onError: onMutationError,
  });
  const amountMutation = useMutation({
    mutationFn: ({ id, amount }: { id: string; amount: number }) => updateProjectPurchaseEntryAmount(id, amount),
    onSuccess: (_data, variables) => {
      setAmountDrafts((current) => {
        const next = { ...current };
        delete next[variables.id];
        return next;
      });
      invalidate();
    },
    onError: onMutationError,
  });
  const deleteMutation = useMutation({ mutationFn: deleteProjectPurchaseEntry, onSuccess: invalidate, onError: onMutationError });
  const approveMutation = useMutation({ mutationFn: approveProjectPurchaseEntry, onSuccess: invalidate, onError: onMutationError });

  if (!employee) return null;
  const canEnter = canEnterProjectPurchase(employee.persona);
  const canApprove = canApproveProjectPurchase({}, employee.persona);
  const entries = entriesQuery.data?.entries ?? [];
  const canCreate = form.category.trim() && form.description.trim() && Number(form.amount) > 0 && !createMutation.isPending;

  function draftAmount(entry: ProjectPurchaseEntryDto): string {
    return amountDrafts[entry.id] ?? String(entry.amount);
  }

  return (
    <div style={{ marginBottom: 20 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
        <h3 style={{ fontSize: 15, margin: 0 }}>Achats réels</h3>
        {canEnter && (
          <button type="button" className="btn btn-small" onClick={() => setShowForm(true)}>
            🛒 Ajouter un achat
          </button>
        )}
      </div>
      <p style={{ margin: "0 0 10px", color: "var(--gsc-color-muted)", fontSize: 13 }}>
        Saisie Administration ou Direction; approbation Direction seulement.
      </p>

      {/* Combine ce tableau (Achat direct, ProjectPurchaseEntry) avec les
          Demandes d'achat déjà appliquées au projet (27 août 2026) — sans
          ça, une demande d'achat approuvée/reçue/appliquée restait invisible
          ici malgré son montant déjà compté dans la tuile ACHATS RÉELS plus
          haut (rapporté par l'utilisatrice : "les achats ne s'ajoutent pas
          au projet jusqu'au bout"). Même source que ce total
          (getApprovedPurchaseEntries, déjà utilisée par le Post-mortem). */}
      <div style={{ marginBottom: 14 }}>
        <ApprovedPurchasesDrilldown projectId={projectId} />
      </div>

      {showForm && (
        <div className="modal-backdrop" onClick={() => setShowForm(false)}>
          <div className="modal" style={{ maxWidth: 640 }} onClick={(event) => event.stopPropagation()}>
            <form
              onSubmit={(event) => {
                event.preventDefault();
                if (canCreate) createMutation.mutate();
              }}
            >
              <div className="modal-header">
                <div>
                  <h2>Ajouter un achat</h2>
                  <p className="modal-subtitle">{projectLabel}</p>
                </div>
                <button type="button" className="modal-close" aria-label="Fermer" onClick={() => setShowForm(false)}>
                  ×
                </button>
              </div>

              <div className="modal-body">
                {error && <p className="form-error">{error}</p>}
                <div className="form-grid">
                  <div className="field">
                    <label htmlFor="pe-date">Date</label>
                    <input id="pe-date" type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} />
                  </div>
                  <div className="field">
                    <label htmlFor="pe-category">Catégorie</label>
                    <select id="pe-category" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>
                      <option value="" disabled>
                        Sélectionner…
                      </option>
                      {categoriesQuery.data?.categories.map((category) => (
                        <option key={category.id} value={category.name}>
                          {category.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="field">
                    <label htmlFor="pe-supplier">Fournisseur</label>
                    <input id="pe-supplier" value={form.supplier} onChange={(e) => setForm({ ...form, supplier: e.target.value })} />
                  </div>
                  <div className="field">
                    <label htmlFor="pe-amount">Montant ($)</label>
                    <input
                      id="pe-amount"
                      type="number"
                      min={0}
                      step="0.01"
                      value={form.amount}
                      onChange={(e) => setForm({ ...form, amount: e.target.value })}
                    />
                  </div>
                  <div className="field field-full">
                    <label htmlFor="pe-description">Description</label>
                    <input id="pe-description" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
                  </div>
                  <div className="field field-full">
                    <label htmlFor="pe-note">Note (facultatif)</label>
                    <input id="pe-note" value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} />
                  </div>
                </div>
              </div>

              <div className="modal-footer">
                <button type="button" className="btn btn-secondary" onClick={() => setShowForm(false)}>
                  Annuler
                </button>
                <button type="submit" className="btn" disabled={!canCreate}>
                  {createMutation.isPending ? "Ajout…" : "Ajouter l'achat"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      {error && !showForm && <p className="form-error">{error}</p>}

      {entries.length === 0 && <p style={{ color: "var(--gsc-color-muted)", fontSize: 13 }}>Aucun achat saisi.</p>}
      {entries.length > 0 && (
        <div style={{ overflowX: "auto" }}>
          <table className="shortlist-table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Fournisseur / Description</th>
                <th>Catégorie</th>
                <th className="num">Montant</th>
                <th>Statut</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {entries.map((entry) => (
                <tr key={entry.id}>
                  <td>{formatDate(entry.date)}</td>
                  <td>
                    {entry.supplier && <strong>{entry.supplier}</strong>}
                    <div className="cell-sub">{entry.description}</div>
                  </td>
                  <td>{entry.category}</td>
                  <td className="num">
                    {entry.status === "pending" && canEnter ? (
                      <input
                        type="number"
                        min={0}
                        step="0.01"
                        style={{ width: 100, textAlign: "right" }}
                        value={draftAmount(entry)}
                        onChange={(e) => setAmountDrafts((current) => ({ ...current, [entry.id]: e.target.value }))}
                      />
                    ) : (
                      formatCurrency(entry.amount)
                    )}
                  </td>
                  <td>
                    <span className={`badge-pill ${entry.status === "approved" ? "badge-conforme" : "badge-neutral"}`}>
                      {entry.status === "approved" ? "Approuvé" : "En attente"}
                    </span>
                  </td>
                  <td style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}>
                    {entry.status === "pending" && canEnter && (
                      <>
                        {Number(draftAmount(entry)) !== entry.amount && (
                          <button
                            type="button"
                            className="btn btn-secondary btn-small"
                            disabled={!(Number(draftAmount(entry)) > 0) || amountMutation.isPending}
                            onClick={() => amountMutation.mutate({ id: entry.id, amount: Number(draftAmount(entry)) })}
                          >
                            Enregistrer
                          </button>
                        )}
                        <button
                          type="button"
                          className="icon-btn"
                          title="Supprimer"
                          disabled={deleteMutation.isPending}
                          onClick={() => deleteMutation.mutate(entry.id)}
                        >
                          ×
                        </button>
                      </>
                    )}
                    {entry.status === "pending" && canApprove && (
                      <button type="button" className="btn btn-small" disabled={approveMutation.isPending} onClick={() => approveMutation.mutate(entry.id)}>
                        Approuver
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
