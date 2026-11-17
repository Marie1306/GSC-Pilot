import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { ApiError } from "../lib/apiClient.js";

interface PurgeConfirmModalProps {
  title: string;
  /** Ce que l'utilisatrice doit taper exactement (numéro d'affichage du dossier) pour que le bouton s'active. */
  displayId: string;
  /** Liste à puces de ce qui disparaît avec le dossier — transparence avant un geste irréversible. */
  warningItems: string[];
  onConfirm: () => Promise<unknown>;
  onClose: () => void;
  onSuccess: () => void;
}

/**
 * Confirmation renforcée pour la suppression PERMANENTE (purge, 17 novembre
 * 2026) — partagée par Projet/Roulement/Call de service/Vente externe (voir
 * settings/purge.ts, backend). Contrairement à la corbeille (confirmation
 * en 2 clics inline, voir ProjectOptionsMenu.tsx/"Supprimer le projet"),
 * ce geste est irréversible : taper le numéro d'affichage exact du dossier
 * avant que le bouton ne s'active — jamais demandé mot pour mot par Marie,
 * mais une sécurité raisonnable vu l'absence totale de retour en arrière
 * (même esprit que confirmer par nom avant de supprimer un dépôt).
 */
export function PurgeConfirmModal({ title, displayId, warningItems, onConfirm, onClose, onSuccess }: PurgeConfirmModalProps) {
  const [typed, setTyped] = useState("");
  const [error, setError] = useState<string | null>(null);
  const mutation = useMutation({
    mutationFn: onConfirm,
    onSuccess: () => {
      onSuccess();
      onClose();
    },
    onError: (err: unknown) => setError(err instanceof ApiError ? err.message : "Une erreur est survenue — réessayez."),
  });
  const canConfirm = typed.trim() === displayId && !mutation.isPending;

  return (
    <div className="modal-backdrop">
      <div className="modal" onClick={(event) => event.stopPropagation()}>
        <div className="modal-header">
          <div>
            <h2>{title}</h2>
            <p className="modal-subtitle">Suppression permanente — aucune restauration possible.</p>
          </div>
          <button type="button" className="modal-close" onClick={onClose} aria-label="Fermer">
            ×
          </button>
        </div>
        <div className="modal-body">
          <p className="form-error" style={{ marginTop: 0 }}>
            Tout ce qui suit disparaît définitivement avec ce dossier :
          </p>
          <ul style={{ margin: "0 0 16px", paddingLeft: 20, fontSize: 13 }}>
            {warningItems.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
          <div className="field field-full">
            <label htmlFor="purge-confirm-input">
              Pour confirmer, tapez <strong>{displayId}</strong> ci-dessous
            </label>
            <input id="purge-confirm-input" type="text" value={typed} onChange={(event) => setTyped(event.target.value)} autoFocus />
          </div>
          {error && <p className="form-error">{error}</p>}
        </div>
        <div className="modal-footer">
          <button type="button" className="btn" disabled={!canConfirm} onClick={() => mutation.mutate()}>
            {mutation.isPending ? "…" : "Supprimer définitivement"}
          </button>
          <button type="button" className="btn btn-secondary" onClick={onClose}>
            Annuler
          </button>
        </div>
      </div>
    </div>
  );
}
