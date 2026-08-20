import { SignaturePad } from "./SignaturePad.js";

interface SignatureModalProps {
  onClose: () => void;
  onSave: (dataUrl: string) => void;
  saving: boolean;
}

/** Signature client dans sa propre fenêtre contextuelle (20 août 2026) — auparavant affichée en ligne dans le call, sur demande de l'utilisatrice pour ne pas l'imposer directement dans la vue principale. */
export function SignatureModal({ onClose, onSave, saving }: SignatureModalProps) {
  return (
    <div className="modal-backdrop">
      <div className="modal" style={{ maxWidth: 560 }}>
        <div className="modal-header">
          <div>
            <h2>Signature du client</h2>
            <p className="modal-subtitle">Faire signer directement sur l'appareil.</p>
          </div>
          <button type="button" className="modal-close" onClick={onClose} aria-label="Fermer">
            ×
          </button>
        </div>
        <div className="modal-body">
          <SignaturePad onSave={onSave} saving={saving} />
        </div>
        <div className="modal-footer">
          <button type="button" className="btn btn-secondary" onClick={onClose}>
            Fermer
          </button>
        </div>
      </div>
    </div>
  );
}
