import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { canMarkProductionComplete, canChooseFulfillmentMode, FULFILLMENT_MODES } from "@gsc-pilot/business-rules";
import { useAuth } from "../../lib/auth/useAuth.js";
import { ApiError } from "../../lib/apiClient.js";
import { fetchPunchableEmployees } from "../timePunch/api.js";
import {
  markProductionComplete,
  chooseFulfillmentMode,
  confirmFulfillment,
  FULFILLMENT_MODE_LABELS,
  FULFILLMENT_STATUS_LABELS,
  type ProjectDetail,
  type FulfillmentMode,
} from "./api.js";

interface ProjectFulfillmentProps {
  project: ProjectDetail;
}

const CONFIRMABLE_MODES: FulfillmentMode[] = [FULFILLMENT_MODES.MANUAL, FULFILLMENT_MODES.PICKUP];

/**
 * Production et sortie (Projet 2C, 17 août 2026) : deux étapes séparées,
 * jamais une seule — voir fulfillment.ts. Warehouse se confirme via le Bon
 * de livraison lui-même (module Livraisons, phase future) — jamais ici.
 */
export function ProjectFulfillment({ project }: ProjectFulfillmentProps) {
  const { employee } = useAuth();
  const queryClient = useQueryClient();
  const [modeForm, setModeForm] = useState(false);
  const [mode, setMode] = useState<FulfillmentMode>(FULFILLMENT_MODES.WAREHOUSE);
  const [driverId, setDriverId] = useState("");
  const [address, setAddress] = useState("");
  const [scheduled, setScheduled] = useState("");
  const [confirmNote, setConfirmNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const employeesQuery = useQuery({ queryKey: ["time-entries", "employees"], queryFn: fetchPunchableEmployees, enabled: modeForm });

  const invalidate = () => {
    setError(null);
    void queryClient.invalidateQueries({ queryKey: ["project", project.id] });
    void queryClient.invalidateQueries({ queryKey: ["projects"] });
  };
  const onMutationError = (err: unknown) => setError(err instanceof ApiError ? err.message : "Une erreur est survenue — réessayez.");

  const completeMutation = useMutation({
    mutationFn: () => markProductionComplete(project.id),
    onSuccess: invalidate,
    onError: onMutationError,
  });
  const chooseModeMutation = useMutation({
    mutationFn: () =>
      chooseFulfillmentMode(project.id, {
        mode,
        driverId: mode === FULFILLMENT_MODES.WAREHOUSE ? driverId || undefined : undefined,
        address: address.trim() || undefined,
        scheduled: scheduled || undefined,
      }),
    onSuccess: () => {
      setModeForm(false);
      invalidate();
    },
    onError: onMutationError,
  });
  const confirmMutation = useMutation({
    mutationFn: () => confirmFulfillment(project.id, confirmNote.trim() || undefined),
    onSuccess: () => {
      setConfirmNote("");
      invalidate();
    },
    onError: onMutationError,
  });

  if (!employee) return null;
  const canComplete = canMarkProductionComplete(employee.persona);
  const canChoose = canChooseFulfillmentMode(employee.persona);
  const canConfirm =
    canChoose &&
    !!project.fulfillmentMode &&
    CONFIRMABLE_MODES.includes(project.fulfillmentMode) &&
    project.fulfillmentStatus === "awaiting_confirmation";

  return (
    <div className="card" style={{ marginBottom: 20 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 10 }}>
        <h3 style={{ margin: 0, fontSize: 15 }}>Production et sortie</h3>
        {project.billingReady && <span className="badge-pill badge-conforme">Prêt à facturer</span>}
      </div>

      <div className="stat-tile-grid" style={{ marginTop: 14, marginBottom: 0 }}>
        <div className="stat-tile">
          <span className="stat-tile-label">Production</span>
          <span className="stat-tile-value">{project.productionCompleted ? "Complétée" : "En cours"}</span>
        </div>
        {project.fulfillmentMode && (
          <div className="stat-tile">
            <span className="stat-tile-label">Mode de sortie</span>
            <span className="stat-tile-value">{FULFILLMENT_MODE_LABELS[project.fulfillmentMode]}</span>
          </div>
        )}
        {project.fulfillmentStatus && (
          <div className="stat-tile">
            <span className="stat-tile-label">Statut</span>
            <span className="stat-tile-value">{FULFILLMENT_STATUS_LABELS[project.fulfillmentStatus] ?? project.fulfillmentStatus}</span>
          </div>
        )}
        {project.fulfillmentAddress && (
          <div className="stat-tile">
            <span className="stat-tile-label">Adresse</span>
            <span className="stat-tile-value">{project.fulfillmentAddress}</span>
          </div>
        )}
      </div>

      {error && <p className="form-error">{error}</p>}

      {!project.productionCompleted && canComplete && (
        <div style={{ marginTop: 14 }}>
          <button type="button" className="btn btn-small" disabled={completeMutation.isPending} onClick={() => completeMutation.mutate()}>
            {completeMutation.isPending ? "…" : "Marquer la production complétée"}
          </button>
        </div>
      )}

      {project.productionCompleted && !project.fulfillmentMode && canChoose && !modeForm && (
        <div style={{ marginTop: 14 }}>
          <button type="button" className="btn btn-small" onClick={() => setModeForm(true)}>
            Choisir le mode de sortie
          </button>
        </div>
      )}

      {modeForm && (
        <form
          className="form-grid"
          style={{ marginTop: 14 }}
          onSubmit={(event) => {
            event.preventDefault();
            chooseModeMutation.mutate();
          }}
        >
          <div className="field">
            <label>Mode de sortie</label>
            <select value={mode} onChange={(e) => setMode(e.target.value as FulfillmentMode)}>
              {Object.entries(FULFILLMENT_MODE_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </div>
          {mode === FULFILLMENT_MODES.WAREHOUSE && (
            <>
              <div className="field">
                <label>Livreur</label>
                <select value={driverId} onChange={(e) => setDriverId(e.target.value)}>
                  <option value="">Non assigné</option>
                  {employeesQuery.data?.employees.map((candidate) => (
                    <option key={candidate.id} value={candidate.id}>
                      {candidate.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="field">
                <label>Adresse de livraison</label>
                <input value={address} onChange={(e) => setAddress(e.target.value)} />
              </div>
              <div className="field">
                <label>Date planifiée (facultatif)</label>
                <input type="date" value={scheduled} onChange={(e) => setScheduled(e.target.value)} />
              </div>
            </>
          )}
          <div className="field field-full" style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button type="submit" className="btn btn-small" disabled={chooseModeMutation.isPending}>
              {chooseModeMutation.isPending ? "…" : "Confirmer le mode"}
            </button>
            <button type="button" className="btn btn-secondary btn-small" onClick={() => setModeForm(false)}>
              Annuler
            </button>
          </div>
        </form>
      )}

      {canConfirm && (
        <div className="card" style={{ marginTop: 14, background: "var(--gsc-color-blue-soft)", border: "none" }}>
          <label style={{ display: "block", marginBottom: 6, fontSize: 13 }}>Note de confirmation (facultatif)</label>
          <input style={{ width: "100%", marginBottom: 8 }} value={confirmNote} onChange={(e) => setConfirmNote(e.target.value)} />
          <button type="button" className="btn btn-small" disabled={confirmMutation.isPending} onClick={() => confirmMutation.mutate()}>
            {confirmMutation.isPending ? "…" : "Confirmer la sortie"}
          </button>
        </div>
      )}

      {project.fulfillmentMode === FULFILLMENT_MODES.WAREHOUSE && project.fulfillmentStatus === "planned" && (
        <p style={{ margin: "14px 0 0", color: "var(--gsc-color-muted)", fontSize: 13 }}>Bon de livraison créé — assigné au livreur.</p>
      )}
      {project.fulfillmentMode === FULFILLMENT_MODES.INSTALLATION && (
        <p style={{ margin: "14px 0 0", color: "var(--gsc-color-muted)", fontSize: 13 }}>
          Le projet reste ouvert — heures et achats d'installation encore à venir.
        </p>
      )}
      {project.fulfillmentConfirmationNote && (
        <p style={{ margin: "14px 0 0", color: "var(--gsc-color-muted)", fontSize: 13 }}>Note : {project.fulfillmentConfirmationNote}</p>
      )}
    </div>
  );
}
