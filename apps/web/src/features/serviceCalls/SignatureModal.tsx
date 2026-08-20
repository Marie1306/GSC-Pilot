import { useRef, useState } from "react";
import { SignaturePad, type SignaturePadHandle } from "./SignaturePad.js";

interface SignatureModalProps {
  displayId: string;
  onClose: () => void;
  onSave: (dataUrl: string, signerName: string) => void;
  saving: boolean;
}

const DECLARATION = "Je confirme les travaux réalisés, les heures, les déplacements, les pièces et l'autorisation de facturer.";

/**
 * Signature client dans sa propre fenêtre contextuelle (20 août 2026) —
 * auparavant affichée en ligne dans le call. Déclaration + nom du
 * signataire + case à cocher tous obligatoires (avec le tracé lui-même)
 * pour activer "Confirmer la signature" — demandé explicitement par
 * l'utilisatrice avec un mockup de référence.
 */
export function SignatureModal({ displayId, onClose, onSave, saving }: SignatureModalProps) {
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
            <h2>Signature client — {displayId}</h2>
            <p className="modal-subtitle">Signer directement sur l'écran du téléphone.</p>
          </div>
          <button type="button" className="modal-close" onClick={onClose} aria-label="Fermer">
            ×
          </button>
        </div>
        <div className="modal-body">
          <p className="service-call-signature-declaration">{DECLARATION}</p>

          <div className="field">
            <label htmlFor="signature-signer-name">Nom du signataire</label>
            <input
              id="signature-signer-name"
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
            {saving ? "Enregistrement…" : "Confirmer la signature"}
          </button>
        </div>
      </div>
    </div>
  );
}
