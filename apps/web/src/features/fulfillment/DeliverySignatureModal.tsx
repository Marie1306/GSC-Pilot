import { useRef, useState } from "react";
import { SignaturePad, type SignaturePadHandle } from "../serviceCalls/SignaturePad.js";

interface DeliverySignatureModalProps {
  displayId: string;
  onClose: () => void;
  onSave: (dataUrl: string) => void;
  saving: boolean;
}

/** Signature à la livraison, dans sa propre fenêtre contextuelle — même patron que SignatureModal (appels de service), mais sans la déclaration/nom du signataire, jamais demandés pour ce module. */
export function DeliverySignatureModal({ displayId, onClose, onSave, saving }: DeliverySignatureModalProps) {
  const padRef = useRef<SignaturePadHandle>(null);
  const [hasDrawn, setHasDrawn] = useState(false);

  function handleConfirm() {
    const dataUrl = padRef.current?.getDataUrl();
    if (!dataUrl) return;
    onSave(dataUrl);
  }

  return (
    <div className="modal-backdrop">
      <div className="modal" style={{ maxWidth: 560 }}>
        <div className="modal-header">
          <div>
            <h2>Signature à la livraison — {displayId}</h2>
            <p className="modal-subtitle">Faire signer directement sur l'écran.</p>
          </div>
          <button type="button" className="modal-close" onClick={onClose} aria-label="Fermer">
            ×
          </button>
        </div>
        <div className="modal-body">
          <SignaturePad ref={padRef} onDrawnChange={setHasDrawn} />
        </div>
        <div className="modal-footer">
          <button type="button" className="btn btn-secondary" onClick={onClose}>
            Annuler
          </button>
          <button type="button" className="btn" disabled={!hasDrawn || saving} onClick={handleConfirm}>
            {saving ? "Enregistrement…" : "Confirmer la livraison"}
          </button>
        </div>
      </div>
    </div>
  );
}
