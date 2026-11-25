import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { canManageExternalSales, canManageExternalSaleDocuments } from "@gsc-pilot/business-rules";
import { useAuth } from "../../lib/auth/useAuth.js";
import { ApiError } from "../../lib/apiClient.js";
import { PdfDropzone } from "../../components/PdfDropzone.js";
import { uploadFileViaSignedUrl } from "../../lib/storageUpload.js";
import { fetchExternalSaleDocuments, fetchExternalSaleDocumentDownloadUrl } from "./api.js";

const BUCKET = "project-documents";

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} o`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} Ko`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} Mo`;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("fr-CA", { year: "numeric", month: "short", day: "numeric" });
}

interface ExternalSaleDocumentsProps {
  externalSaleId: string;
  /** Soumission d'origine (24 novembre 2026) — présente seulement si la vente vient d'une soumission convertie, jamais pour une vente créée directement. */
  quoteId: string | null;
  quoteDisplayId: string | null;
  /** Confirmation de commande de cette soumission (25 novembre 2026) — indépendante de la vente, peut exister ou non peu importe l'ordre de conversion. */
  confirmationId: string | null;
  confirmationDisplayId: string | null;
  invoiceEntryId: string | null;
  invoiceNumber: string | null;
}

/**
 * Section Documents de la Vente externe (17 novembre 2026) — une vente
 * externe n'a jamais de budgétaire/post-mortem, donc Soumission d'origine
 * (si convertie, 24 novembre 2026 — demande explicite : la soumission doit
 * disparaître de la section "Soumissions" une fois convertie et rester
 * accessible uniquement ici) + Facture envoyée (au plus une, voir
 * externalSales/service.ts) + documents téléversés (même bucket partagé
 * "project-documents", préfixe "external-sale/", voir
 * modules/externalSales/documents.ts backend).
 *
 * Permissions : canManageExternalSales (déjà le gate du module entier,
 * OWNER/ADMIN/BOSS) pour le bloc entier, canManageExternalSaleDocuments
 * (plus étroite, OWNER/BOSS) pour le dépôt.
 */
export function ExternalSaleDocuments({
  externalSaleId,
  quoteId,
  quoteDisplayId,
  confirmationId,
  confirmationDisplayId,
  invoiceEntryId,
  invoiceNumber,
}: ExternalSaleDocumentsProps) {
  const { employee } = useAuth();
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);

  const documentsQuery = useQuery({ queryKey: ["external-sale-documents", externalSaleId], queryFn: () => fetchExternalSaleDocuments(externalSaleId) });

  const uploadMutation = useMutation({
    mutationFn: (file: File) =>
      uploadFileViaSignedUrl<{ id: string }>(
        BUCKET,
        `/api/external-sales/${externalSaleId}/documents/upload-url`,
        `/api/external-sales/${externalSaleId}/documents`,
        file,
      ),
    onSuccess: () => {
      setError(null);
      void queryClient.invalidateQueries({ queryKey: ["external-sale-documents", externalSaleId] });
    },
    onError: (err: unknown) => setError(err instanceof ApiError ? err.message : err instanceof Error ? err.message : "Échec de l'envoi — réessayez."),
  });

  async function openDocument(documentId: string) {
    const { url } = await fetchExternalSaleDocumentDownloadUrl(documentId);
    window.open(url, "_blank", "noopener");
  }

  if (!employee || !canManageExternalSales(employee.persona)) return null;

  const documents = documentsQuery.data?.documents ?? [];
  const canUpload = canManageExternalSaleDocuments(employee.persona);

  return (
    <div className="card" style={{ marginBottom: 20 }}>
      <div className="card-band-header">
        <h3>Documents</h3>
      </div>

      {(quoteId || confirmationId || invoiceEntryId) && (
        <ul className="notes-list">
          {quoteId && (
            <li>
              <button type="button" className="link-button" onClick={() => window.open(`/external-sale-quotes/${quoteId}/export`, "_blank", "noopener")}>
                Soumission {quoteDisplayId}
              </button>
            </li>
          )}
          {confirmationId && (
            <li>
              <button
                type="button"
                className="link-button"
                onClick={() => window.open(`/external-sale-confirmations/${confirmationId}/export`, "_blank", "noopener")}
              >
                Confirmation de commande {confirmationDisplayId}
              </button>
            </li>
          )}
          {invoiceEntryId && (
            <li>
              <button type="button" className="link-button" onClick={() => window.open(`/factures/${invoiceEntryId}/export`, "_blank", "noopener")}>
                Facture {invoiceNumber}
              </button>
            </li>
          )}
        </ul>
      )}

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
