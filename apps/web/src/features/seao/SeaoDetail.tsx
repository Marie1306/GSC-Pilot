import { useQuery } from "@tanstack/react-query";
import { formatCalendarDate } from "../../lib/date.js";
import { fetchSeaoFileDetail, SEAO_STATUS_LABELS } from "./api.js";
import { SeaoDocuments } from "./SeaoDocuments.js";
import { SeaoAnalysisHistory } from "./SeaoAnalysisHistory.js";
import { SeaoBordereau } from "./SeaoBordereau.js";
import { SeaoCompetitors } from "./SeaoCompetitors.js";
import { SeaoNotes } from "./SeaoNotes.js";
import { SeaoGoNoGoPanel } from "./SeaoGoNoGoPanel.js";

interface SeaoDetailProps {
  id: string;
  onClose: () => void;
}

/** Détail d'un dossier SEAO (16 septembre 2026) — coquille orchestrant les sous-panneaux, même patron que ExternalSaleDetail.tsx. */
export function SeaoDetail({ id, onClose }: SeaoDetailProps) {
  const detailQuery = useQuery({ queryKey: ["seao-file", id], queryFn: () => fetchSeaoFileDetail(id) });
  const file = detailQuery.data;

  return (
    <div className="modal-backdrop">
      <div className="modal" style={{ maxWidth: 820 }}>
        <div className="modal-header">
          <div>
            <h2>{file ? `${file.displayId} — ${file.company ?? file.contactName}` : "Dossier SEAO"}</h2>
            {file && (
              <p className="modal-subtitle">
                {SEAO_STATUS_LABELS[file.status] ?? file.status}
                {file.submissionDeadline && ` · Échéance ${formatCalendarDate(file.submissionDeadline)}`}
                {file.referenceNumber && ` · Réf. ${file.referenceNumber}`}
              </p>
            )}
          </div>
          <button type="button" className="modal-close" onClick={onClose} aria-label="Fermer">
            ×
          </button>
        </div>

        <div className="modal-body">
          {!file && <p>Chargement…</p>}
          {file && (
            <>
              {file.title && <p style={{ marginTop: 0, color: "var(--gsc-color-muted)" }}>{file.title}</p>}
              {file.nonSubmissionReason && <p className="form-error">Non soumissionné — {file.nonSubmissionReason}</p>}

              <SeaoGoNoGoPanel seaoFile={file} onClose={onClose} />
              <SeaoDocuments seaoFileId={file.id} documents={file.documents} />
              <SeaoAnalysisHistory analyses={file.analyses} />
              <SeaoBordereau seaoFileId={file.id} lines={file.bordereauLines} />
              <SeaoCompetitors seaoFileId={file.id} competitors={file.competitors} />
              <SeaoNotes seaoFileId={file.id} notes={file.notes} />
            </>
          )}
        </div>

        <div className="modal-footer">
          <button type="button" className="btn btn-secondary" onClick={onClose}>
            Fermer
          </button>
        </div>
      </div>
    </div>
  );
}
