import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { canAccessOverviewViews, canManageSoumission, canManageRollingDocuments } from "@gsc-pilot/business-rules";
import { useAuth } from "../../lib/auth/useAuth.js";
import { ApiError } from "../../lib/apiClient.js";
import { PdfDropzone } from "../../components/PdfDropzone.js";
import { uploadFileViaSignedUrl } from "../../lib/storageUpload.js";
import { fetchSoumissionsForBudget } from "../soumissions/api.js";
import { SoumissionDocumentRows } from "../projects/ProjectDocuments.js";
import { fetchRollingInvoicePlan, fetchRollingDocuments, fetchRollingDocumentDownloadUrl } from "./api.js";

const BUCKET = "project-documents";

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} o`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} Ko`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} Mo`;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("fr-CA", { year: "numeric", month: "short", day: "numeric" });
}

interface RollingDocumentsProps {
  rollingId: string;
  budgetId: string | null;
}

/**
 * Section Documents du Roulement (17 novembre 2026, même demande que
 * Projet étendue à Roulement/Vente externe) — mirror exact de
 * ProjectDocuments.tsx : Budgétaire/Soumission/Confirmation de commande (si
 * ce roulement en a un, « presque toujours » confirmé par Marie) +
 * Factures envoyées + Post-mortem (toujours présent, un roulement en a
 * toujours un) + documents téléversés (même bucket partagé "project-
 * documents", préfixe "rolling/", voir modules/rollings/documents.ts
 * backend).
 *
 * Permissions : mêmes ensembles exacts que ProjectDocuments.tsx —
 * canAccessOverviewViews pour le bloc entier, canManageSoumission (plus
 * étroite) pour les lignes Soumission/CC, canManageRollingDocuments pour
 * le dépôt.
 */
export function RollingDocuments({ rollingId, budgetId }: RollingDocumentsProps) {
  const { employee } = useAuth();
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);

  const soumissionsQuery = useQuery({
    queryKey: ["soumissions", budgetId],
    queryFn: () => fetchSoumissionsForBudget(budgetId!),
    enabled: !!budgetId,
  });
  const invoicePlanQuery = useQuery({ queryKey: ["rolling", rollingId, "invoice-plan"], queryFn: () => fetchRollingInvoicePlan(rollingId) });
  const documentsQuery = useQuery({ queryKey: ["rolling-documents", rollingId], queryFn: () => fetchRollingDocuments(rollingId) });

  const uploadMutation = useMutation({
    mutationFn: (file: File) =>
      uploadFileViaSignedUrl<{ id: string }>(BUCKET, `/api/rollings/${rollingId}/documents/upload-url`, `/api/rollings/${rollingId}/documents`, file),
    onSuccess: () => {
      setError(null);
      void queryClient.invalidateQueries({ queryKey: ["rolling-documents", rollingId] });
    },
    onError: (err: unknown) => setError(err instanceof ApiError ? err.message : err instanceof Error ? err.message : "Échec de l'envoi — réessayez."),
  });

  async function openDocument(documentId: string) {
    const { url } = await fetchRollingDocumentDownloadUrl(documentId);
    window.open(url, "_blank", "noopener");
  }

  if (!employee || !canAccessOverviewViews(employee.persona)) return null;

  const soumissions = soumissionsQuery.data?.soumissions ?? [];
  const sentInvoices = (invoicePlanQuery.data?.plan ?? []).filter((entry) => entry.invoiceNumber);
  const documents = documentsQuery.data?.documents ?? [];
  const showSoumission = canManageSoumission(employee.persona);
  const canUpload = canManageRollingDocuments(employee.persona);

  return (
    <div className="card" style={{ marginBottom: 20 }}>
      <div className="card-band-header">
        <h3>Documents</h3>
      </div>

      <ul className="notes-list">
        {budgetId && (
          <li>
            <button type="button" className="link-button" onClick={() => window.open(`/budgetaire/${budgetId}/export`, "_blank", "noopener")}>
              Budgétaire
            </button>
          </li>
        )}
        {showSoumission && soumissions.map((soumission) => <SoumissionDocumentRows key={soumission.id} soumission={soumission} />)}
        {sentInvoices.map((entry) => (
          <li key={entry.id}>
            <button type="button" className="link-button" onClick={() => window.open(`/factures/${entry.id}/export`, "_blank", "noopener")}>
              Facture {entry.invoiceNumber}
            </button>
            <div className="note-meta">{entry.label}</div>
          </li>
        ))}
        <li>
          <button type="button" className="link-button" onClick={() => window.open(`/roulements/${rollingId}/post-mortem/export`, "_blank", "noopener")}>
            Post-mortem
          </button>
        </li>
      </ul>

      <h3 style={{ fontSize: 15, margin: "20px 0 4px" }}>Documents ajoutés</h3>
      {error && <p className="form-error">{error}</p>}
      {documents.length === 0 && <p className="empty-hint">Aucun document téléversé.</p>}
      {documents.length > 0 && (
        <ul className="notes-list">
          {documents.map((doc) => (
            <li key={doc.id}>
              <button type="button" className="link-button" onClick={() => void openDocument(doc.id)}>
                {doc.fileName}
              </button>
              <div className="note-meta">
                {formatBytes(doc.fileSize)} · déposé par {doc.uploadedByName} le {formatDate(doc.uploadedAt)}
              </div>
            </li>
          ))}
        </ul>
      )}
      {canUpload && (
        <PdfDropzone
          accept="*/*"
          disabled={uploadMutation.isPending}
          label={uploadMutation.isPending ? "Envoi en cours…" : "Glisser un document ici, ou cliquer pour parcourir"}
          onFileSelected={(file) => uploadMutation.mutate(file)}
        />
      )}
    </div>
  );
}
