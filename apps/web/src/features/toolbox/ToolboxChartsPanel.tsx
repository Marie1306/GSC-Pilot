import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { canManageToolboxLibrary } from "@gsc-pilot/business-rules";
import { useAuth } from "../../lib/auth/useAuth.js";
import { ApiError } from "../../lib/apiClient.js";
import { PdfDropzone } from "../../components/PdfDropzone.js";
import { uploadFileViaSignedUrl } from "../../lib/storageUpload.js";
import { fetchToolboxCharts, fetchToolboxChartDownloadUrl, retireToolboxChart } from "./api.js";

const BUCKET = "toolbox-charts";

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} o`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} Ko`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} Mo`;
}

/** Chartes de référence d'une catégorie — liste visible à tous (transparence sur ce que l'IA connaît), dépôt/retrait réservés à canManageToolboxLibrary (gardé aussi côté serveur, voir toolbox/routes.ts). */
export function ToolboxChartsPanel({ categoryId }: { categoryId: string }) {
  const { employee } = useAuth();
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const chartsQuery = useQuery({ queryKey: ["toolbox-charts", categoryId], queryFn: () => fetchToolboxCharts(categoryId) });
  const charts = chartsQuery.data?.charts ?? [];
  const canManage = !!employee && canManageToolboxLibrary(employee.persona);

  const invalidate = () => void queryClient.invalidateQueries({ queryKey: ["toolbox-charts", categoryId] });
  const uploadMutation = useMutation({
    mutationFn: (file: File) =>
      uploadFileViaSignedUrl<{ id: string }>(BUCKET, `/api/toolbox/categories/${categoryId}/charts/upload-url`, `/api/toolbox/categories/${categoryId}/charts`, file),
    onSuccess: () => {
      setError(null);
      invalidate();
    },
    onError: (err: unknown) => setError(err instanceof ApiError ? err.message : err instanceof Error ? err.message : "Échec de l'envoi — réessayez."),
  });
  const retireMutation = useMutation({ mutationFn: ({ id, active }: { id: string; active: boolean }) => retireToolboxChart(id, active), onSuccess: invalidate });

  async function openChart(chartId: string) {
    const { url } = await fetchToolboxChartDownloadUrl(chartId);
    window.open(url, "_blank", "noopener");
  }

  return (
    <div className="card" style={{ marginTop: 20 }}>
      <div className="card-band-header">
        <h3>Chartes de référence</h3>
      </div>
      {error && <p className="form-error">{error}</p>}
      {charts.length === 0 && <p className="empty-hint">Aucune charte déposée — l'IA ne peut pas encore répondre pour cette catégorie.</p>}
      {charts.length > 0 && (
        <ul className="notes-list">
          {charts.map((chart) => (
            <li key={chart.id} style={{ opacity: chart.active ? 1 : 0.6 }}>
              <button type="button" className="link-button" onClick={() => void openChart(chart.id)}>
                {chart.fileName}
              </button>
              {!chart.active && " (retirée)"}
              <div className="note-meta">
                {formatBytes(chart.fileSize)} · déposée par {chart.uploadedByName}
                {canManage && (
                  <button
                    type="button"
                    className="btn btn-secondary btn-small"
                    style={{ marginLeft: 10 }}
                    onClick={() => retireMutation.mutate({ id: chart.id, active: !chart.active })}
                  >
                    {chart.active ? "Retirer" : "Réactiver"}
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
      {canManage && (
        <PdfDropzone
          disabled={uploadMutation.isPending}
          label={uploadMutation.isPending ? "Envoi en cours…" : "Glisser un PDF ici, ou cliquer pour parcourir"}
          onFileSelected={(file) => uploadMutation.mutate(file)}
        />
      )}
    </div>
  );
}
