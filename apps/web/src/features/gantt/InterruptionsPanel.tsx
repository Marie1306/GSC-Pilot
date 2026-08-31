import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ApiError } from "../../lib/apiClient.js";
import { fetchPunchableEmployees } from "../timePunch/api.js";
import {
  fetchInterruptions,
  createInterruption,
  updateInterruption,
  deleteInterruption,
  INTERRUPTION_REASONS,
  INTERRUPTION_REASON_LABELS,
  type InterruptionDto,
  type InterruptionReason,
} from "./interruptions-api.js";

interface InterruptionsPanelProps {
  canEdit: boolean;
}

interface InterruptionFormState {
  employeeId: string | null;
  date: string;
  hours: string;
  reason: InterruptionReason;
  reference: string;
}

function emptyForm(): InterruptionFormState {
  return { employeeId: null, date: "", hours: "", reason: "absence", reference: "" };
}

function formatDate(iso: string): string {
  return new Date(`${iso}T12:00:00`).toLocaleDateString("fr-CA", { year: "numeric", month: "short", day: "numeric" });
}

/**
 * Interruptions de capacité (31 août 2026) — mécanisme "Ajouter une
 * interruption" déjà prévu, jamais construit avant cette phase : réduit la
 * capacité disponible d'un employé précis ou de tout l'atelier pour une
 * journée donnée. Section directement dans GanttPage (pas une nouvelle
 * route, spec confirmée) — le calendrier au-dessus se recalcule tout seul
 * dès qu'une interruption change (computeProductionSchedule relit la table
 * à chaque calcul, jamais un recalcul stocké).
 */
export function InterruptionsPanel({ canEdit }: InterruptionsPanelProps) {
  const queryClient = useQueryClient();
  const listQuery = useQuery({ queryKey: ["gantt", "interruptions"], queryFn: fetchInterruptions });
  const employeesQuery = useQuery({ queryKey: ["time-entries", "employees"], queryFn: fetchPunchableEmployees, enabled: canEdit });
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<InterruptionFormState>(emptyForm);
  const [error, setError] = useState<string | null>(null);

  const invalidate = () => {
    setError(null);
    void queryClient.invalidateQueries({ queryKey: ["gantt"] });
  };
  const onMutationError = (err: unknown) => setError(err instanceof ApiError ? err.message : "Une erreur est survenue — réessayez.");
  const closeForm = () => {
    setShowForm(false);
    setEditingId(null);
    setForm(emptyForm());
  };

  const submitInput = { employeeId: form.employeeId, date: form.date, hours: Number(form.hours) || 0, reason: form.reason, reference: form.reference.trim() || undefined };

  const createMutation = useMutation({
    mutationFn: () => createInterruption(submitInput),
    onSuccess: () => {
      closeForm();
      invalidate();
    },
    onError: onMutationError,
  });
  const updateMutation = useMutation({
    mutationFn: (id: string) => updateInterruption(id, submitInput),
    onSuccess: () => {
      closeForm();
      invalidate();
    },
    onError: onMutationError,
  });
  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteInterruption(id),
    onSuccess: invalidate,
    onError: onMutationError,
  });

  const interruptions = listQuery.data?.interruptions ?? [];
  const canSubmit = !!form.date && Number(form.hours) > 0 && !createMutation.isPending && !updateMutation.isPending;

  function startEdit(interruption: InterruptionDto): void {
    setEditingId(interruption.id);
    setForm({
      employeeId: interruption.employeeId,
      date: interruption.date.slice(0, 10),
      hours: String(interruption.hours),
      reason: interruption.reason,
      reference: interruption.reference ?? "",
    });
    setShowForm(true);
  }

  return (
    <div className="card" style={{ marginTop: 20 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <h3 style={{ margin: 0, fontSize: 15 }}>Interruptions</h3>
        {canEdit && (
          <button
            type="button"
            className="btn btn-small"
            onClick={() => {
              closeForm();
              setShowForm(true);
            }}
          >
            + Ajouter une interruption
          </button>
        )}
      </div>
      <p style={{ margin: "4px 0 10px", color: "var(--gsc-color-muted)", fontSize: 13 }}>
        Absence, vacances, appel de service urgent, jour férié, etc. — réduit la capacité disponible pour la journée choisie (employé précis ou tout
        l'atelier).
      </p>

      {showForm && (
        <div className="modal-backdrop" onClick={closeForm}>
          <div className="modal" style={{ maxWidth: 480 }} onClick={(event) => event.stopPropagation()}>
            <form
              onSubmit={(event) => {
                event.preventDefault();
                if (!canSubmit) return;
                if (editingId) updateMutation.mutate(editingId);
                else createMutation.mutate();
              }}
            >
              <div className="modal-header">
                <div>
                  <h2>{editingId ? "Modifier l'interruption" : "Ajouter une interruption"}</h2>
                </div>
                <button type="button" className="modal-close" aria-label="Fermer" onClick={closeForm}>
                  ×
                </button>
              </div>
              <div className="modal-body">
                {error && <p className="form-error">{error}</p>}
                <div className="form-grid">
                  <div className="field">
                    <label htmlFor="interruption-employee">Employé</label>
                    <select
                      id="interruption-employee"
                      value={form.employeeId ?? ""}
                      onChange={(e) => setForm({ ...form, employeeId: e.target.value || null })}
                    >
                      <option value="">Tout l'atelier</option>
                      {employeesQuery.data?.employees.map((emp) => (
                        <option key={emp.id} value={emp.id}>
                          {emp.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="field">
                    <label htmlFor="interruption-date">Date</label>
                    <input id="interruption-date" type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} />
                  </div>
                  <div className="field">
                    <label htmlFor="interruption-hours">Heures</label>
                    <input
                      id="interruption-hours"
                      type="number"
                      min={0}
                      step="0.1"
                      value={form.hours}
                      onChange={(e) => setForm({ ...form, hours: e.target.value })}
                    />
                  </div>
                  <div className="field">
                    <label htmlFor="interruption-reason">Motif</label>
                    <select id="interruption-reason" value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value as InterruptionReason })}>
                      {INTERRUPTION_REASONS.map((reason) => (
                        <option key={reason} value={reason}>
                          {INTERRUPTION_REASON_LABELS[reason]}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="field field-full">
                    <label htmlFor="interruption-reference">Référence (facultatif)</label>
                    <input id="interruption-reference" value={form.reference ?? ""} onChange={(e) => setForm({ ...form, reference: e.target.value })} />
                  </div>
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-secondary" onClick={closeForm}>
                  Annuler
                </button>
                <button type="submit" className="btn" disabled={!canSubmit}>
                  {createMutation.isPending || updateMutation.isPending ? "…" : "Enregistrer"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {interruptions.length === 0 ? (
        <p style={{ color: "var(--gsc-color-muted)", fontSize: 13 }}>Aucune interruption.</p>
      ) : (
        <div style={{ overflowX: "auto" }}>
          <table className="shortlist-table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Employé</th>
                <th className="num">Heures</th>
                <th>Motif</th>
                <th>Référence</th>
                {canEdit && <th></th>}
              </tr>
            </thead>
            <tbody>
              {interruptions.map((interruption) => (
                <tr key={interruption.id}>
                  <td>{formatDate(interruption.date)}</td>
                  <td>{interruption.employeeName ?? "Tout l'atelier"}</td>
                  <td className="num">{interruption.hours} h</td>
                  <td>{INTERRUPTION_REASON_LABELS[interruption.reason]}</td>
                  <td>{interruption.reference ?? "—"}</td>
                  {canEdit && (
                    <td style={{ display: "flex", gap: 6 }}>
                      <button type="button" className="btn btn-secondary btn-small" onClick={() => startEdit(interruption)}>
                        Modifier
                      </button>
                      <button
                        type="button"
                        className="btn btn-secondary btn-small"
                        disabled={deleteMutation.isPending}
                        onClick={() => deleteMutation.mutate(interruption.id)}
                      >
                        Supprimer
                      </button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
