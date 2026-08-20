import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { fetchDeliveryDetail, updateDelivery, confirmDelivery } from "./api.js";
import { DeliverySignatureModal } from "./DeliverySignatureModal.js";
import "./fulfillment.css";

interface DeliveryDetailProps {
  id: string;
  onClose: () => void;
}

const STATUS_LABELS: Record<string, string> = { planned: "Planifiée", completed: "Complétée" };

function formatDate(iso: string | null): string {
  return iso ? new Date(iso).toLocaleDateString("fr-CA", { year: "numeric", month: "long", day: "numeric" }) : "—";
}

/**
 * Détail d'une livraison (module Livraisons, 20 août 2026) — pas de
 * permissions par action distinctes ici : canAccessDeliveries gate déjà
 * toute la route (voir invoicing/routes.ts pour le même principe), donc
 * quiconque atteint ce détail peut éditer/confirmer.
 */
export function DeliveryDetail({ id, onClose }: DeliveryDetailProps) {
  const queryClient = useQueryClient();
  const detailQuery = useQuery({ queryKey: ["delivery", id], queryFn: () => fetchDeliveryDetail(id) });
  const delivery = detailQuery.data?.delivery;

  const [itemsDraft, setItemsDraft] = useState<string | null>(null);
  const [kmDraft, setKmDraft] = useState<string | null>(null);
  const [noteDraft, setNoteDraft] = useState<string | null>(null);
  const [signing, setSigning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const invalidate = () => {
    setError(null);
    void queryClient.invalidateQueries({ queryKey: ["delivery", id] });
    void queryClient.invalidateQueries({ queryKey: ["deliveries"] });
  };
  const onMutationError = (err: unknown) => setError(err instanceof Error ? err.message : "Erreur — réessayez.");

  const updateMutation = useMutation({
    mutationFn: (patch: Parameters<typeof updateDelivery>[1]) => updateDelivery(id, patch),
    onSuccess: invalidate,
    onError: onMutationError,
  });
  const confirmMutation = useMutation({
    mutationFn: (dataUrl: string) => confirmDelivery(id, dataUrl),
    onSuccess: () => {
      setSigning(false);
      invalidate();
    },
    onError: onMutationError,
  });

  if (!delivery) {
    return (
      <div className="modal-backdrop">
        <div className="modal">
          <div className="modal-body">{detailQuery.isError ? "Livraison introuvable." : "Chargement…"}</div>
        </div>
      </div>
    );
  }

  const completed = delivery.status === "completed";
  const items = itemsDraft ?? delivery.items ?? "";
  const km = kmDraft ?? (delivery.kmTraveled !== null ? String(delivery.kmTraveled) : "");
  const note = noteDraft ?? delivery.conditionNote ?? "";

  return (
    <div className="modal-backdrop">
      <div className="modal" style={{ maxWidth: 720 }}>
        <div className="modal-header">
          <div>
            <h2>
              {delivery.displayId} — {delivery.company ?? delivery.contactName}
            </h2>
            <p className="modal-subtitle">
              {delivery.sourceLabel} · Créée le {formatDate(delivery.createdAt)}
            </p>
          </div>
          <button type="button" className="modal-close" onClick={onClose} aria-label="Fermer">
            ×
          </button>
        </div>

        <div className="modal-body">
          <div className="stat-tile-grid">
            <div className="stat-tile">
              <span className="stat-tile-label">État</span>
              <span className={`badge-pill ${completed ? "badge-conforme" : "badge-neutral"}`}>{STATUS_LABELS[delivery.status] ?? delivery.status}</span>
            </div>
            <div className="stat-tile">
              <span className="stat-tile-label">Magasinier</span>
              <span className="stat-tile-value">{delivery.driverEmployeeName ?? "Non assigné"}</span>
            </div>
            <div className="stat-tile">
              <span className="stat-tile-label">Date planifiée</span>
              <span className="stat-tile-value">{formatDate(delivery.scheduledAt)}</span>
            </div>
          </div>

          <div className="delivery-contact-card">
            <strong>
              {delivery.contactName}
              {delivery.company ? ` — ${delivery.company}` : ""}
            </strong>
            <div className="delivery-contact-line">📍 {delivery.address ?? "—"}</div>
            <div className="delivery-contact-line">📞 {delivery.contactPhone ?? "—"}</div>
          </div>

          <div className="section-heading" style={{ marginTop: 20 }}>
            <div>
              <h3>Marchandise à livrer</h3>
            </div>
          </div>
          <textarea
            rows={2}
            style={{ width: "100%" }}
            placeholder="ex. 2 caisses, 1 palette…"
            value={items}
            onChange={(event) => setItemsDraft(event.target.value)}
            disabled={completed}
          />

          <div className="section-heading" style={{ marginTop: 20 }}>
            <div>
              <h3>Kilométrage et état</h3>
            </div>
          </div>
          <div style={{ display: "flex", gap: 20, alignItems: "flex-start", flexWrap: "wrap" }}>
            <div className="field" style={{ marginBottom: 0 }}>
              <label>Kilométrage</label>
              <input
                type="number"
                min={0}
                step="0.1"
                style={{ width: 100 }}
                value={km}
                onChange={(event) => setKmDraft(event.target.value)}
                disabled={completed}
              />
            </div>
            <div className="field" style={{ flex: 1, minWidth: 200, marginBottom: 0 }}>
              <label>Note d'état (facultatif)</label>
              <input style={{ width: "100%" }} value={note} onChange={(event) => setNoteDraft(event.target.value)} disabled={completed} />
            </div>
          </div>

          {!completed && (
            <div style={{ marginTop: 10 }}>
              <button
                type="button"
                className="btn btn-secondary"
                disabled={updateMutation.isPending}
                onClick={() =>
                  updateMutation.mutate({
                    items: items.trim() || null,
                    kmTraveled: km ? Number(km) : null,
                    conditionNote: note.trim() || null,
                  })
                }
              >
                {updateMutation.isPending ? "Enregistrement…" : "Enregistrer les données terrain"}
              </button>
            </div>
          )}

          <div className="section-heading" style={{ marginTop: 20 }}>
            <div>
              <h3>Signature à la livraison</h3>
            </div>
          </div>
          {delivery.signatureCaptured && delivery.signatureImageUrl ? (
            <div>
              <img src={delivery.signatureImageUrl} alt="Signature du client" className="signature-pad-preview" />
              {delivery.completedAt && (
                <p style={{ margin: "6px 0 0", fontSize: 13, color: "var(--gsc-color-muted)" }}>Livré le {formatDate(delivery.completedAt)}.</p>
              )}
            </div>
          ) : (
            <button type="button" className="btn btn-secondary" onClick={() => setSigning(true)}>
              Faire signer le client
            </button>
          )}

          {error && <p className="form-error">{error}</p>}
        </div>

        <div className="modal-footer">
          <button type="button" className="btn btn-secondary" onClick={onClose}>
            Fermer
          </button>
        </div>
      </div>

      {signing && (
        <DeliverySignatureModal
          displayId={delivery.displayId}
          onClose={() => setSigning(false)}
          onSave={(dataUrl) => confirmMutation.mutate(dataUrl)}
          saving={confirmMutation.isPending}
        />
      )}
    </div>
  );
}
