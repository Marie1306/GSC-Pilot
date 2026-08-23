import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import QrScanner from "qr-scanner";
import { canAccessOverviewViews } from "@gsc-pilot/business-rules";
import { useAuth } from "../../lib/auth/useAuth.js";
import { fetchProjectOptions, type ProjectOptionDto } from "../timePunch/api.js";
import { StartTaskModal } from "../timePunch/StartTaskModal.js";
import "./qrScan.css";

/**
 * Scan QR (23 août 2026, spec confirmée : « étiquette 1×1 po par projet,
 * scannable (caméra) ou saisie manuelle. Employé → ouvre le choix de tâche
 * à puncher; Direction/Administration → ouvre la fiche projet et ses
 * achats. ») — Propriétaire et Magasinier non nommés dans la spec,
 * confirmés séparément avec l'utilisatrice le 23 août 2026 : Propriétaire
 * suit Direction/Administration (fiche projet), Magasinier suit Employé
 * (choix de tâche). D'où le branchement sur canAccessOverviewViews
 * (owner/admin/boss) plutôt qu'un rôle par rôle.
 *
 * Caméra via qr-scanner (décision technique confirmée dans le plan de
 * fondation — jamais l'API BarcodeDetector, peu fiable sur iOS), toujours
 * avec la saisie manuelle du numéro de projet en repli, y compris quand la
 * caméra est indisponible ou refusée.
 */
export function QrScanPage() {
  const { employee } = useAuth();
  const navigate = useNavigate();
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const scannerRef = useRef<QrScanner | null>(null);
  const projectsRef = useRef<ProjectOptionDto[]>([]);
  const resolveRef = useRef<(code: string) => void>(() => {});

  const [manualCode, setManualCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [cameraState, setCameraState] = useState<"checking" | "available" | "unavailable">("checking");
  const [scanning, setScanning] = useState(true);
  const [punchProject, setPunchProject] = useState<ProjectOptionDto | null>(null);

  const projectsQuery = useQuery({ queryKey: ["time-entries", "project-options"], queryFn: fetchProjectOptions });

  useEffect(() => {
    projectsRef.current = projectsQuery.data?.projects ?? [];
  }, [projectsQuery.data]);

  useEffect(() => {
    resolveRef.current = (code: string) => {
      const trimmed = code.trim();
      if (!trimmed) return;
      const match = projectsRef.current.find((p) => p.projectNumber.toLowerCase() === trimmed.toLowerCase());
      if (!match) {
        setError(`Aucun projet avec le numéro « ${trimmed} ».`);
        return;
      }
      setError(null);
      scannerRef.current?.stop();
      setScanning(false);
      if (employee && canAccessOverviewViews(employee.persona)) {
        navigate(`/projets?open=${match.id}`);
      } else {
        setPunchProject(match);
      }
    };
  });

  useEffect(() => {
    let cancelled = false;
    QrScanner.hasCamera().then((has) => {
      if (!cancelled) setCameraState(has ? "available" : "unavailable");
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (cameraState !== "available" || !scanning || !videoRef.current) return;
    const scanner = new QrScanner(videoRef.current, (result) => resolveRef.current(result.data), {
      highlightScanRegion: true,
      highlightCodeOutline: true,
      onDecodeError: () => {},
    });
    scannerRef.current = scanner;
    scanner.start().catch(() => setCameraState("unavailable"));
    return () => {
      scanner.stop();
      scanner.destroy();
      scannerRef.current = null;
    };
  }, [cameraState, scanning]);

  function restartScanning() {
    setPunchProject(null);
    setError(null);
    setManualCode("");
    setScanning(true);
  }

  if (punchProject) {
    return <StartTaskModal initialValue={{ projectType: "project", projectId: punchProject.id }} onClose={restartScanning} />;
  }

  return (
    <div>
      <div className="card">
        <h1 style={{ marginTop: 0, fontSize: 20 }}>Scan QR</h1>
        <p style={{ color: "var(--gsc-color-muted)", margin: 0 }}>
          Pointez la caméra vers l'étiquette du projet, ou entrez son numéro directement.
        </p>
      </div>

      <div className="card" style={{ marginTop: 20 }}>
        {cameraState === "available" && scanning && (
          <div className="qr-video-wrap">
            <video ref={videoRef} className="qr-video" muted playsInline />
          </div>
        )}
        {cameraState === "unavailable" && (
          <p style={{ color: "var(--gsc-color-muted)", fontSize: 13 }}>
            Caméra indisponible ou accès refusé — entrez le numéro du projet ci-dessous.
          </p>
        )}
        {cameraState === "checking" && <p style={{ color: "var(--gsc-color-muted)", fontSize: 13 }}>Recherche d'une caméra…</p>}

        <form
          className="form-grid"
          style={{ marginTop: 16 }}
          onSubmit={(event) => {
            event.preventDefault();
            resolveRef.current(manualCode);
          }}
        >
          <div className="field field-full">
            <label>Numéro de projet</label>
            <input value={manualCode} onChange={(e) => setManualCode(e.target.value)} placeholder="ex. 2357" autoFocus={cameraState !== "available"} />
          </div>
          <div className="field field-full">
            <button type="submit" className="btn btn-small" disabled={!manualCode.trim() || projectsQuery.isLoading}>
              Rechercher
            </button>
          </div>
        </form>
        {error && <p className="form-error">{error}</p>}
      </div>
    </div>
  );
}
