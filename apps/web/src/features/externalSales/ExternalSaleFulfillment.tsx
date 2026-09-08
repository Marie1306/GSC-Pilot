import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { canManageExternalSales, FULFILLMENT_MODES } from "@gsc-pilot/business-rules";
import { useAuth } from "../../lib/auth/useAuth.js";
import { ApiError } from "../../lib/apiClient.js";
import { fetchPunchableEmployees } from "../timePunch/api.js";
import {
  markExternalSaleReadyToDeliver,
  chooseExternalSaleFulfillmentMode,
  confirmExternalSaleFulfillment,
  FULFILLMENT_MODE_LABELS,
  FULFILLMENT_STATUS_LABELS,
  type ExternalSaleDetailDto,
  type FulfillmentMode,
} from "./api.js";

interface ExternalSaleFulfillmentProps {
  sale: ExternalSaleDetailDto;
}

const CONFIRMABLE_MODES: FulfillmentMode[] = [FULFILLMENT_MODES.MANUAL, FULFILLMENT_MODES.PICKUP];

/**
 * Livraison (8 septembre 2026) — même mécanisme que ProjectFulfillment.tsx
 * (fulfillment.ts, jamais modifié), readyToDeliver joue le rôle de
 * productionCompleted côté serveur (voir externalSales/service.ts).
 * "Marquer prêt à être livré" est refusé par le serveur tant qu'il reste des
 * pièces non reçues/appliquées (message d'erreur réel affiché tel quel, même
 * patron onMutationError que partout ailleurs) — voir le tableau des pièces
 * dans ExternalSaleDetail.tsx pour le détail ligne par ligne.
 */
export function ExternalSaleFulfillment({ sale }: ExternalSaleFulfillmentProps) {
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
    void queryClient.invalidateQueries({ queryKey: ["external-sale", sale.id] });
    void queryClient.invalidateQueries({ queryKey: ["external-sales"] });
  };
  const onMutationError = (err: unknown) => setError(err instanceof ApiError ? err.message : "Une erreur est survenue — réessayez.");

  const readyMutation = useMutation({
    mutationFn: () => markExternalSaleReadyToDeliver(sale.id),
    onSuccess: invalidate,
    onError: onMutationError,
  });
  const chooseModeMutation = useMutation({
    mutationFn: () =>
      chooseExternalSaleFulfillmentMode(sale.id, {
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
    mutationFn: () => confirmExternalSaleFulfillment(sale.id, confirmNote.trim() || undefined),
    onSuccess: () => {
      setConfirmNote("");
      invalidate();
    },
    onError: onMutationError,
  });

  if (!employee) return null;
  const canManage = canManageExternalSales(employee.persona);
  const canConfirm =
    canManage && !!sale.fulfillmentMode && CONFIRMABLE_MODES.includes(sale.fulfillmentMode) && sale.fulfillmentStatus === "awaiting_confirmation";

  return (
    <div className="card" style={{ marginBottom: 20 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 10 }}>
        <h3 style={{ margin: 0, fontSize: 15 }}>Livraison</h3>
        {sale.billingReady && <span className="badge-pill badge-conforme">Prêt à facturer</span>}
      </div>

      <div className="stat-tile-grid" style={{ marginTop: 14, marginBottom: 0 }}>
        <div className="stat-tile">
          <span className="stat-tile-label">Pièces</span>
          <span className="stat-tile-value">{sale.readyToDeliver ? "Prêtes à livrer" : "En attente"}</span>
        </div>
        {sale.fulfillmentMode && (
          <div className="stat-tile">
            <span className="stat-tile-label">Mode de sortie</span>
            <span className="stat-tile-value">{FULFILLMENT_MODE_LABELS[sale.fulfillmentMode]}</span>
          </div>
        )}
        {sale.fulfillmentStatus && (
          <div className="stat-tile">
            <span className="stat-tile-label">Statut</span>
            <span className="stat-tile-value">{FULFILLMENT_STATUS_LABELS[sale.fulfillmentStatus] ?? sale.fulfillmentStatus}</span>
          </div>
        )}
        {sale.fulfillmentAddress && (
          <div className="stat-tile">
            <span className="stat-tile-label">Adresse</span>
            <span className="stat-tile-value">{sale.fulfillmentAddress}</span>
          </div>
        )}
      </div>

      {error && <p className="form-error">{error}</p>}

      {!sale.readyToDeliver && canManage && (
        <div style={{ marginTop: 14 }}>
          <button type="button" className="btn btn-small" disabled={readyMutation.isPending} onClick={() => readyMutation.mutate()}>
            {readyMutation.isPending ? "…" : "Marquer prêt à être livré"}
          </button>
        </div>
      )}

      {sale.readyToDeliver && !sale.fulfillmentMode && canManage && !modeForm && (
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

      {sale.fulfillmentMode === FULFILLMENT_MODES.WAREHOUSE && sale.fulfillmentStatus === "planned" && (
        <p style={{ margin: "14px 0 0", color: "var(--gsc-color-muted)", fontSize: 13 }}>Bon de livraison créé — assigné au livreur.</p>
      )}
      {sale.fulfillmentMode === FULFILLMENT_MODES.INSTALLATION && (
        <p style={{ margin: "14px 0 0", color: "var(--gsc-color-muted)", fontSize: 13 }}>La vente reste ouverte — installation encore à venir.</p>
      )}
      {sale.fulfillmentConfirmationNote && (
        <p style={{ margin: "14px 0 0", color: "var(--gsc-color-muted)", fontSize: 13 }}>Note : {sale.fulfillmentConfirmationNote}</p>
      )}
    </div>
  );
}
