import { useEffect, useRef, useState } from "react";
import QRCode from "qrcode";
import "../projects/projectQrCode.css";

interface RollingQrCodeProps {
  rolling: { rollingNumber: string; label: string };
  onClose: () => void;
}

/**
 * Code QR du roulement (28 août 2026, même besoin que ProjectQrCode.tsx —
 * réutilise projectQrCode.css tel quel, les classes sont génériques).
 * Encode rollingNumber (RL-AAAA-NNNN), même principe que projectNumber :
 * lisible/tapable à la main pour la saisie manuelle de repli de Scan QR.
 */
export function RollingQrCode({ rolling, onClose }: RollingQrCodeProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!canvasRef.current) return;
    QRCode.toCanvas(canvasRef.current, rolling.rollingNumber, { width: 60, margin: 1 }).catch(() =>
      setError("Impossible de générer le code QR."),
    );
  }, [rolling.rollingNumber]);

  return (
    <div className="modal-backdrop">
      <div className="modal" style={{ maxWidth: 360 }}>
        <div className="modal-header">
          <div>
            <h2>Code QR — {rolling.rollingNumber}</h2>
            <p className="modal-subtitle">{rolling.label}</p>
          </div>
          <button type="button" className="modal-close no-print" onClick={onClose} aria-label="Fermer">
            ×
          </button>
        </div>
        <div className="modal-body">
          {error && <p className="form-error">{error}</p>}
          <div className="qr-print-area">
            <canvas ref={canvasRef} />
            <div className="qr-print-number">{rolling.rollingNumber}</div>
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
