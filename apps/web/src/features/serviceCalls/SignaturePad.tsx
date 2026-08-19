import { useRef, useState, type PointerEvent as ReactPointerEvent } from "react";

interface SignaturePadProps {
  onSave: (dataUrl: string) => void;
  saving?: boolean;
}

/**
 * Signature capturée directement en dataURL (canvas), enregistrée telle
 * quelle dans ServiceCall.signatureImageUrl — aucune infrastructure de
 * stockage de fichiers montée cette passe (portée, voir CLAUDE.md).
 */
export function SignaturePad({ onSave, saving }: SignaturePadProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawingRef = useRef(false);
  const [hasDrawn, setHasDrawn] = useState(false);

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
    setHasDrawn(true);
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
  }

  function save() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    onSave(canvas.toDataURL("image/png"));
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
      <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
        <button type="button" className="btn btn-secondary" onClick={clear} disabled={!hasDrawn}>
          Effacer
        </button>
        <button type="button" className="btn" onClick={save} disabled={!hasDrawn || saving}>
          {saving ? "Enregistrement…" : "Enregistrer la signature"}
        </button>
      </div>
    </div>
  );
}
