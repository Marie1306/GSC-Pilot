import { useRef, useState, forwardRef, useImperativeHandle, type PointerEvent as ReactPointerEvent } from "react";

export interface SignaturePadHandle {
  getDataUrl: () => string | null;
}

interface SignaturePadProps {
  onDrawnChange?: (hasDrawn: boolean) => void;
}

/**
 * Signature capturée directement en dataURL (canvas), enregistrée telle
 * quelle dans ServiceCall.signatureImageUrl — aucune infrastructure de
 * stockage de fichiers montée cette passe (portée, voir CLAUDE.md).
 *
 * Composant purement dessin (20 août 2026) — la confirmation (déclaration,
 * nom du signataire, case à cocher) vit dans SignatureModal.tsx, qui lit
 * le tracé via getDataUrl() au moment de son propre bouton "Confirmer".
 */
export const SignaturePad = forwardRef<SignaturePadHandle, SignaturePadProps>(function SignaturePad({ onDrawnChange }, ref) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawingRef = useRef(false);
  const [hasDrawn, setHasDrawn] = useState(false);

  useImperativeHandle(ref, () => ({
    getDataUrl: () => (hasDrawn && canvasRef.current ? canvasRef.current.toDataURL("image/png") : null),
  }));

  function markDrawn() {
    setHasDrawn(true);
    onDrawnChange?.(true);
  }

  function pointerPos(event: ReactPointerEvent<HTMLCanvasElement>) {
    const rect = canvasRef.current!.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  }

  function handlePointerDown(event: ReactPointerEvent<HTMLCanvasElement>) {
    const ctx = canvasRef.current?.getContext("2d");
    if (!ctx) return;
    drawingRef.current = true;
    const { x, y } = pointerPos(event);
    ctx.beginPath();
    ctx.moveTo(x, y);
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function handlePointerMove(event: ReactPointerEvent<HTMLCanvasElement>) {
    if (!drawingRef.current) return;
    const ctx = canvasRef.current?.getContext("2d");
    if (!ctx) return;
    const { x, y } = pointerPos(event);
    ctx.strokeStyle = "#1a1a1a";
    ctx.lineWidth = 2;
    ctx.lineCap = "round";
    ctx.lineTo(x, y);
    ctx.stroke();
    markDrawn();
  }

  function handlePointerUp() {
    drawingRef.current = false;
  }

  function clear() {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    setHasDrawn(false);
    onDrawnChange?.(false);
  }

  return (
    <div>
      <canvas
        ref={canvasRef}
        width={480}
        height={160}
        className="signature-pad-canvas"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerLeave={handlePointerUp}
      />
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, marginTop: 8 }}>
        <span style={{ fontSize: 13, color: "var(--gsc-color-muted)" }}>Utiliser le doigt ou la souris</span>
        <button type="button" className="btn btn-secondary" onClick={clear} disabled={!hasDrawn}>
          Effacer
        </button>
      </div>
    </div>
  );
});
