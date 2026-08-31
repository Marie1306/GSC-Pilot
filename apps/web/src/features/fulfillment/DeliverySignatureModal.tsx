import { useRef, useState } from "react";
import { SignaturePad, type SignaturePadHandle } from "../serviceCalls/SignaturePad.js";

interface DeliverySignatureModalProps {
  displayId: string;
  onClose: () => void;
  onSave: (dataUrl: string, signerName: string) => void;
  saving: boolean;
}

const DECLARATION = "Je confirme avoir reçu le matériel décrit et reconnais que son état apparent a été vérifié au moment de la livraison.";

/**
 * Signature à la livraison, dans sa propre fenêtre contextuelle — même
 * patron que SignatureModal (appels de service, 20 août 2026). Déclaration +
 * nom du signataire + case à cocher tous obligatoires (avec le tracé
 * lui-même) pour activer "Confirmer" (31 août 2026, demande explicite de
 * l'utilisatrice avec mockup v19 de référence — jusque-là volontairement
 * omis pour ce module, décision maintenant révisée).
 */
export function DeliverySignatureModal({ displayId, onClose, onSave, saving }: DeliverySignatureModalProps) {
  const padRef = useRef<SignaturePadHandle>(null);
  const [signerName, setSignerName] = useState("");
  const [accepted, setAccepted] = useState(false);
  const [hasDrawn, setHasDrawn] = useState(false);

  const canConfirm = hasDrawn && signerName.trim().length > 0 && accepted;

  function handleConfirm() {
    const dataUrl = padRef.current?.getDataUrl();
    if (!dataUrl || !canConfirm) return;
    onSave(dataUrl, signerName.trim());
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
          <p className="delivery-signature-declaration">{DECLARATION}</p>

          <div className="field">
            <label htmlFor="delivery-signature-signer-name">Nom du signataire</label>
            <input
              id="delivery-signature-signer-name"
              placeholder="Nom complet"
              value={signerName}
              onChange={(event) => setSignerName(event.target.value)}
            />
          </div>

          <SignaturePad ref={padRef} onDrawnChange={setHasDrawn} />

          <label style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 14 }}>
            <input type="checkbox" checked={accepted} onChange={(event) => setAccepted(event.target.checked)} />
            J'ai lu et j'accepte la déclaration ci-dessus.
          </label>
        </div>
        <div className="modal-footer">
          <button type="button" className="btn btn-secondary" onClick={onClose}>
            Annuler
          </button>
          <button type="button" className="btn" disabled={!canConfirm || saving} onClick={handleConfirm}>
            {saving ? "Enregistrement…" : "Confirmer la livraison"}
          </button>
        </div>
      </div>
    </div>
  );
}
