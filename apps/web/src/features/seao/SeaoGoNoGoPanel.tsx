import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { canDecideSeaoGoNoGo } from "@gsc-pilot/business-rules";
import { useAuth } from "../../lib/auth/useAuth.js";
import { ApiError } from "../../lib/apiClient.js";
import { decideSeaoGoNoGo, recordSeaoOutcome, convertSeaoFileToProject, type SeaoFileDetailDto } from "./api.js";

interface SeaoGoNoGoPanelProps {
  seaoFile: SeaoFileDetailDto;
  onClose: () => void;
}

/**
 * Go/no-go, issue finale et conversion en projet — Propriétaire+Direction
 * seulement (canDecideSeaoGoNoGo), distinct de la gestion courante du
 * dossier (canManageSeao, gardée par le reste de SeaoDetail.tsx).
 */
export function SeaoGoNoGoPanel({ seaoFile, onClose }: SeaoGoNoGoPanelProps) {
  const { employee } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [reason, setReason] = useState("");
  const [projectName, setProjectName] = useState(seaoFile.title ?? `${seaoFile.company ?? seaoFile.contactName} — ${seaoFile.displayId}`);
  const [error, setError] = useState<string | null>(null);

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ["seao-file", seaoFile.id] });
    void queryClient.invalidateQueries({ queryKey: ["seao-files"] });
  };
  const onError = (err: unknown) => setError(err instanceof ApiError ? err.message : "Une erreur est survenue — réessayez.");

  const goNoGoMutation = useMutation({
    mutationFn: (go: boolean) => decideSeaoGoNoGo(seaoFile.id, go, go ? undefined : reason),
    onSuccess: invalidate,
    onError,
  });
  const outcomeMutation = useMutation({
    mutationFn: (won: boolean) => recordSeaoOutcome(seaoFile.id, won),
    onSuccess: invalidate,
    onError,
  });
  const convertMutation = useMutation({
    mutationFn: () => convertSeaoFileToProject(seaoFile.id, projectName.trim()),
    onSuccess: ({ projectId }) => {
      onClose();
      navigate(`/projets?open=${projectId}`);
    },
    onError,
  });

  if (!employee || !canDecideSeaoGoNoGo(employee.persona)) return null;

  return (
    <div className="card" style={{ marginBottom: 20, background: "var(--gsc-color-surface2)" }}>
      {error && <p className="form-error">{error}</p>}

      {seaoFile.status === "a_l_etude" && (
        <>
          <h3 style={{ fontSize: 15, marginBottom: 8 }}>Go / no-go</h3>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
            <button type="button" className="btn btn-small" disabled={goNoGoMutation.isPending} onClick={() => goNoGoMutation.mutate(true)}>
              Aller de l'avant
            </button>
            <input placeholder="Motif (si non soumissionné)" value={reason} onChange={(e) => setReason(e.target.value)} style={{ flex: 1, minWidth: 180 }} />
            <button type="button" className="btn btn-secondary btn-small" disabled={goNoGoMutation.isPending} onClick={() => goNoGoMutation.mutate(false)}>
              Ne pas soumissionner
            </button>
          </div>
        </>
      )}

      {seaoFile.status === "en_soumission" && (
        <>
          <h3 style={{ fontSize: 15, marginBottom: 8 }}>Issue de la soumission</h3>
          <div style={{ display: "flex", gap: 8 }}>
            <button type="button" className="btn btn-small" disabled={outcomeMutation.isPending} onClick={() => outcomeMutation.mutate(true)}>
              Gagné
            </button>
            <button type="button" className="btn btn-secondary btn-small" disabled={outcomeMutation.isPending} onClick={() => outcomeMutation.mutate(false)}>
              Perdu
            </button>
          </div>
        </>
      )}

      {seaoFile.status === "gagne" && !seaoFile.projectId && (
        <>
          <h3 style={{ fontSize: 15, marginBottom: 8 }}>Convertir en projet</h3>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <input value={projectName} onChange={(e) => setProjectName(e.target.value)} style={{ flex: 1, minWidth: 220 }} />
            <button type="button" className="btn btn-small" disabled={!projectName.trim() || convertMutation.isPending} onClick={() => convertMutation.mutate()}>
              {convertMutation.isPending ? "Conversion…" : "Convertir en projet"}
            </button>
          </div>
        </>
      )}

      {seaoFile.status === "gagne" && seaoFile.projectId && (
        <p style={{ margin: 0 }}>
          Déjà converti en projet —{" "}
          <button type="button" className="link-button" onClick={() => navigate(`/projets?open=${seaoFile.projectId}`)}>
            l'ouvrir
          </button>
          .
        </p>
      )}
    </div>
  );
}
