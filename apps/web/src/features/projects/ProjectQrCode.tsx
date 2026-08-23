import { useEffect, useRef, useState } from "react";
import QRCode from "qrcode";
import "./projectQrCode.css";

interface ProjectQrCodeProps {
  project: { projectNumber: string; name: string };
  onClose: () => void;
}

/**
 * Génération/impression du code QR d'un projet (23 août 2026, spec
 * confirmée : « étiquette 1×1 po par projet »). Encode le projectNumber
 * tel quel (même valeur que la saisie manuelle de repli côté Scan QR) —
 * jamais un identifiant technique, pour rester lisible/tapable à la main.
 */
export function ProjectQrCode({ project, onClose }: ProjectQrCodeProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!canvasRef.current) return;
    QRCode.toCanvas(canvasRef.current, project.projectNumber, { width: 240, margin: 1 }).catch(() =>
      setError("Impossible de générer le code QR."),
    );
  }, [project.projectNumber]);

  return (
    <div className="modal-backdrop">
      <div className="modal" style={{ maxWidth: 360 }}>
        <div className="modal-header">
          <div>
            <h2>Code QR — {project.projectNumber}</h2>
            <p className="modal-subtitle">{project.name}</p>
          </div>
          <button type="button" className="modal-close no-print" onClick={onClose} aria-label="Fermer">
            ×
          </button>
        </div>
        <div className="modal-body">
          {error && <p className="form-error">{error}</p>}
          <div className="qr-print-area">
            <canvas ref={canvasRef} />
            <div className="qr-print-number">{project.projectNumber}</div>
          </div>
          <p className="no-print" style={{ color: "var(--gsc-color-muted)", fontSize: 13, marginTop: 12 }}>
            À imprimer sur une étiquette 1×1 po — ajustez l'échelle dans la fenêtre d'impression de votre navigateur au besoin.
          </p>
        </div>
        <div className="modal-footer no-print">
          <button type="button" className="btn btn-secondary" onClick={onClose}>
            Fermer
          </button>
          <button type="button" className="btn" onClick={() => window.print()}>
            Imprimer
          </button>
        </div>
      </div>
    </div>
  );
}
