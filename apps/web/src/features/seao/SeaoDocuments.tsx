import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { PdfDropzone } from "../../components/PdfDropzone.js";
import { uploadFileViaSignedUrl } from "../../lib/storageUpload.js";
import { ApiError } from "../../lib/apiClient.js";
import { fetchSeaoDocumentDownloadUrl, triggerSeaoAnalysis, type SeaoDocumentDto } from "./api.js";

const BUCKET = "seao-documents";

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} o`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} Ko`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} Mo`;
}

interface SeaoDocumentsProps {
  seaoFileId: string;
  documents: SeaoDocumentDto[];
}

/**
 * Dépôt des documents + déclenchement de l'analyse IA (16 septembre 2026) —
 * flux à 3 requêtes (voir lib/storageUpload.ts) : l'API génère l'URL
 * signée, le navigateur envoie le PDF directement à Supabase Storage,
 * puis confirme (le serveur pousse le fichier vers l'API Files d'Anthropic).
 */
export function SeaoDocuments({ seaoFileId, documents }: SeaoDocumentsProps) {
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ["seao-file", seaoFileId] });
    void queryClient.invalidateQueries({ queryKey: ["seao-files"] });
  };

  const uploadMutation = useMutation({
    mutationFn: (file: File) =>
      uploadFileViaSignedUrl<{ id: string }>(BUCKET, `/api/seao/${seaoFileId}/documents/upload-url`, `/api/seao/${seaoFileId}/documents`, file),
    onSuccess: () => {
      setError(null);
      invalidate();
    },
    onError: (err: unknown) => setError(err instanceof ApiError ? err.message : err instanceof Error ? err.message : "Échec de l'envoi — réessayez."),
  });

  const analyzeMutation = useMutation({
    mutationFn: () => triggerSeaoAnalysis(seaoFileId),
    onSuccess: () => {
      setError(null);
      invalidate();
    },
    onError: (err: unknown) => setError(err instanceof ApiError ? err.message : "Échec de l'analyse — réessayez."),
  });

  async function openDocument(documentId: string) {
    const { url } = await fetchSeaoDocumentDownloadUrl(documentId);
    window.open(url, "_blank", "noopener");
  }

  return (
    <div style={{ marginBottom: 20 }}>
      <h3 style={{ fontSize: 15, marginBottom: 4 }}>Documents</h3>
      {error && <p className="form-error">{error}</p>}
      {documents.length === 0 && <p className="empty-hint">Aucun document déposé.</p>}
      {documents.length > 0 && (
        <ul className="notes-list">
          {documents.map((doc) => (
            <li key={doc.id}>
              <button type="button" className="link-button" onClick={() => void openDocument(doc.id)}>
                {doc.fileName}
              </button>
              <div className="note-meta">
                {formatBytes(doc.fileSize)} · déposé par {doc.uploadedByName}
              </div>
            </li>
          ))}
        </ul>
      )}
      <PdfDropzone
        disabled={uploadMutation.isPending}
        label={uploadMutation.isPending ? "Envoi en cours…" : "Glisser un PDF ici, ou cliquer pour parcourir"}
        onFileSelected={(file) => uploadMutation.mutate(file)}
      />
      <button
        type="button"
        className="btn btn-small"
        style={{ marginTop: 10 }}
        disabled={documents.length === 0 || analyzeMutation.isPending}
        onClick={() => analyzeMutation.mutate()}
      >
        {analyzeMutation.isPending ? "Analyse en cours…" : "Analyser les documents"}
      </button>
    </div>
  );
}
