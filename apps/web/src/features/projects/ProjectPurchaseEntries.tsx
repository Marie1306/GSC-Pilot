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
  formatCurrency,
  type ProjectPurchaseEntryDto,
} from "../purchases/api.js";

interface ProjectPurchaseEntriesProps {
  projectId: string;
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
export function ProjectPurchaseEntries({ projectId }: ProjectPurchaseEntriesProps) {
  const { employee } = useAuth();
  const queryClient = useQueryClient();
  const entriesQuery = useQuery({ queryKey: ["project-purchase-entries", projectId], queryFn: () => fetchProjectPurchaseEntries(projectId) });
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [amountDrafts, setAmountDrafts] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);

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
        {canEnter && !showForm && (
          <button type="button" className="btn btn-small" onClick={() => setShowForm(true)}>
            🛒 Ajouter un achat
          </button>
        )}
      </div>
      <p style={{ margin: "0 0 10px", color: "var(--gsc-color-muted)", fontSize: 13 }}>
        Saisie Administration ou Direction; approbation Direction seulement.
      </p>

      {showForm && (
        <form
          className="card"
          style={{ marginBottom: 14 }}
          onSubmit={(event) => {
            event.preventDefault();
            if (canCreate) createMutation.mutate();
          }}
        >
          <div className="form-grid">
            <div className="field">
              <label>Date</label>
              <input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} />
            </div>
            <div className="field">
              <label>Catégorie</label>
              <input value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} placeholder="ex. Outillage" />
            </div>
            <div className="field">
              <label>Fournisseur</label>
              <input value={form.supplier} onChange={(e) => setForm({ ...form, supplier: e.target.value })} />
            </div>
            <div className="field">
              <label>Montant ($)</label>
              <input type="number" min={0} step="0.01" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} />
            </div>
            <div className="field field-full">
              <label>Description</label>
              <input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
            </div>
            <div className="field field-full">
              <label>Note (facultatif)</label>
              <input value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} />
            </div>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button type="submit" className="btn btn-small" disabled={!canCreate}>
              {createMutation.isPending ? "Ajout…" : "Ajouter"}
            </button>
            <button type="button" className="btn btn-secondary btn-small" onClick={() => setShowForm(false)}>
              Annuler
            </button>
          </div>
        </form>
      )}
      {error && <p className="form-error">{error}</p>}

      {entries.length === 0 && !showForm && <p style={{ color: "var(--gsc-color-muted)", fontSize: 13 }}>Aucun achat saisi.</p>}
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
