import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { canAccessOverviewViews, canManageSoumission, canManageProjectDocuments } from "@gsc-pilot/business-rules";
import { useAuth } from "../../lib/auth/useAuth.js";
import { ApiError } from "../../lib/apiClient.js";
import { PdfDropzone } from "../../components/PdfDropzone.js";
import { uploadFileViaSignedUrl } from "../../lib/storageUpload.js";
import { fetchSoumissionsForBudget, type SoumissionDetailDto } from "../soumissions/api.js";
import { fetchConfirmationForSoumission } from "../confirmationsDeCommande/api.js";
import { fetchInvoicePlan, fetchProjectDocuments, fetchProjectDocumentDownloadUrl } from "./api.js";

const BUCKET = "project-documents";

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} o`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} Ko`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} Mo`;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("fr-CA", { year: "numeric", month: "short", day: "numeric" });
}

interface ProjectDocumentsProps {
  projectId: string;
  budgetId: string | null;
}

/**
 * Soumission + sa Confirmation de commande éventuelle, sur leur propre
 * ligne chacune (même raison que SoumissionCard.tsx : useQuery par ligne,
 * interdit dans un .map() du parent — règle des hooks). Exportée : réutilisée
 * telle quelle par RollingDocuments.tsx (17 novembre 2026, section Documents
 * étendue au Roulement — même mécanisme Soumission/CC, simplement keyé par
 * Budget.id comme ici, jamais dupliquée).
 */
export function SoumissionDocumentRows({ soumission }: { soumission: SoumissionDetailDto }) {
  const confirmationQuery = useQuery({
    queryKey: ["confirmation-for-soumission", soumission.id],
    queryFn: () => fetchConfirmationForSoumission(soumission.id),
    enabled: soumission.status === "accepted",
  });
  const confirmation = confirmationQuery.data?.confirmation ?? null;

  return (
    <>
      <li>
        <button type="button" className="link-button" onClick={() => window.open(`/soumissions/${soumission.id}/export`, "_blank", "noopener")}>
          Soumission {soumission.displayId}
        </button>
      </li>
      {confirmation && (
        <li>
          <button type="button" className="link-button" onClick={() => window.open(`/confirmations/${confirmation.id}/export`, "_blank", "noopener")}>
            Confirmation de commande {confirmation.displayId}
          </button>
        </li>
      )}
    </>
  );
}

/**
 * Section Documents (16 novembre 2026) — regroupe l'accès à tous les
 * documents d'un projet : ceux déjà GÉNÉRÉS par l'appli (Budgétaire/
 * Soumission/Confirmation de commande/Factures envoyées/Post-mortem —
 * simples liens vers leurs vues d'export existantes, jamais dupliqués
 * ici) et les documents TÉLÉVERSÉS (même patron que SeaoDocuments.tsx,
 * sans l'analyse IA — voir modules/projects/documents.ts backend).
 * Construit en prévision du futur contrat d'offre de service signé par
 * le client (pas encore bâti) — capacité de dépôt générique, prête à
 * l'avance.
 *
 * Visibilité du bloc entier : canAccessOverviewViews (même ensemble que
 * Facture/Post-mortem — Employé/Magasinier n'ont accès à AUCUN des 5
 * documents aujourd'hui). Soumission/Confirmation restent en plus
 * gardées par canManageSoumission (plus étroite, exclut Administration),
 * exactement comme partout ailleurs où elles apparaissent. Dépôt d'un
 * nouveau document : canManageProjectDocuments (Direction/Propriétaire
 * seulement, confirmé par Marie) — la lecture/le téléchargement restent
 * ouverts à qui voit le bloc.
 */
export function ProjectDocuments({ projectId, budgetId }: ProjectDocumentsProps) {
  const { employee } = useAuth();
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);

  const soumissionsQuery = useQuery({
    queryKey: ["soumissions", budgetId],
    queryFn: () => fetchSoumissionsForBudget(budgetId!),
    enabled: !!budgetId,
  });
  const invoicePlanQuery = useQuery({ queryKey: ["invoice-plan", projectId], queryFn: () => fetchInvoicePlan(projectId) });
  const documentsQuery = useQuery({ queryKey: ["project-documents", projectId], queryFn: () => fetchProjectDocuments(projectId) });

  const uploadMutation = useMutation({
    mutationFn: (file: File) =>
      uploadFileViaSignedUrl<{ id: string }>(BUCKET, `/api/projects/${projectId}/documents/upload-url`, `/api/projects/${projectId}/documents`, file),
    onSuccess: () => {
      setError(null);
      void queryClient.invalidateQueries({ queryKey: ["project-documents", projectId] });
    },
    onError: (err: unknown) => setError(err instanceof ApiError ? err.message : err instanceof Error ? err.message : "Échec de l'envoi — réessayez."),
  });

  async function openDocument(documentId: string) {
    const { url } = await fetchProjectDocumentDownloadUrl(documentId);
    window.open(url, "_blank", "noopener");
  }

  if (!employee || !canAccessOverviewViews(employee.persona)) return null;

  const soumissions = soumissionsQuery.data?.soumissions ?? [];
  const sentInvoices = (invoicePlanQuery.data?.entries ?? []).filter((entry) => entry.invoiceNumber);
  const documents = documentsQuery.data?.documents ?? [];
  const showSoumission = canManageSoumission(employee.persona);
  const canUpload = canManageProjectDocuments(employee.persona);

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
          <button type="button" className="link-button" onClick={() => window.open(`/projets/${projectId}/post-mortem/export`, "_blank", "noopener")}>
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
