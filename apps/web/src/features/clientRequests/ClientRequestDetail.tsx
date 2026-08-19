import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  fetchClientRequestDetail,
  addClientRequestNote,
  updateClientRequestStatus,
  REQUEST_TYPE_LABELS,
  URGENCY_LABELS,
  STATUS_LABELS,
  type SettableStatus,
} from "./api.js";
import { ClientRequestOptionsMenu } from "./ClientRequestOptionsMenu.js";

interface ClientRequestDetailProps {
  id: string;
  onClose: () => void;
}

/** "Perdue" retirée des pastilles (18 août 2026) — devient une action dédiée dans le menu Options, voir ClientRequestOptionsMenu.tsx. */
const SETTABLE_STATUSES: SettableStatus[] = ["new", "in_progress"];

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("fr-CA", { year: "numeric", month: "short", day: "numeric" });
}

export function ClientRequestDetail({ id, onClose }: ClientRequestDetailProps) {
  const queryClient = useQueryClient();
  const detailQuery = useQuery({ queryKey: ["client-request", id], queryFn: () => fetchClientRequestDetail(id) });
  const [noteBody, setNoteBody] = useState("");
  const [optionsOpen, setOptionsOpen] = useState(false);

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ["client-request", id] });
    void queryClient.invalidateQueries({ queryKey: ["client-requests"] });
  };

  const noteMutation = useMutation({
    mutationFn: (body: string) => addClientRequestNote(id, body),
    onSuccess: () => {
      setNoteBody("");
      invalidate();
    },
  });

  const statusMutation = useMutation({
    mutationFn: (status: SettableStatus) => updateClientRequestStatus(id, status),
    onSuccess: invalidate,
  });

  const request = detailQuery.data?.clientRequest;

  return (
    <div className="modal-backdrop">
      <div className="modal client-request-modal">
        <div className="modal-header">
          <div>
            <h2>{request ? `${request.displayId} — ${request.company ?? request.contactName}` : "Demande client"}</h2>
            {request && <p className="modal-subtitle">{REQUEST_TYPE_LABELS[request.requestType as keyof typeof REQUEST_TYPE_LABELS] ?? request.requestType}</p>}
          </div>
          <button type="button" className="modal-close" onClick={onClose} aria-label="Fermer">
            ×
          </button>
        </div>

        <div className="modal-body">
          {!request && <p>Chargement…</p>}
          {request && (
            <>
              <div className="detail-grid">
                <div>
                  <span className="detail-label">Contact</span>
                  <span>{request.contactName}{request.contactRole ? ` — ${request.contactRole}` : ""}</span>
                </div>
                <div>
                  <span className="detail-label">Courriel</span>
                  <span>{request.email ?? "—"}</span>
                </div>
                <div>
                  <span className="detail-label">Téléphone</span>
                  <span>{request.phone ?? "—"}</span>
                </div>
                <div>
                  <span className="detail-label">Adresse</span>
                  <span>{request.address ?? "—"}</span>
                </div>
                <div>
                  <span className="detail-label">Urgence</span>
                  <span>{URGENCY_LABELS[request.urgency as keyof typeof URGENCY_LABELS] ?? request.urgency ?? "—"}</span>
                </div>
                <div>
                  <span className="detail-label">Canal d'entrée</span>
                  <span>{request.channelName ?? "—"}{request.sourceDetail ? ` — ${request.sourceDetail}` : ""}</span>
                </div>
                <div>
                  <span className="detail-label">Créée par</span>
                  <span>{request.createdByName} · {formatDate(request.createdAt)}</span>
                </div>
                <div>
                  <span className="detail-label">Prochaine relance</span>
                  <span>{request.nextFollowUp ? formatDate(request.nextFollowUp) : "—"}</span>
                </div>
              </div>

              <div className="field field-full">
                <span className="detail-label">Résumé de la demande</span>
                <p className="summary-text">{request.summary}</p>
              </div>

              <div className="status-row">
                <span className="detail-label">Statut</span>
                <div className="status-actions">
                  {(request.status === "new" || request.status === "in_progress") &&
                    SETTABLE_STATUSES.map((status) => (
                      <button
                        key={status}
                        type="button"
                        className={`btn btn-secondary status-btn ${request.status === status ? "status-btn-active" : ""}`}
                        disabled={statusMutation.isPending || request.status === status}
                        onClick={() => statusMutation.mutate(status)}
                      >
                        {STATUS_LABELS[status]}
                      </button>
                    ))}
                  {request.status === "converted" && <span className="status-btn status-btn-active">{STATUS_LABELS.converted}</span>}
                  {request.status === "lost" && <span className="status-btn status-btn-active">{STATUS_LABELS.lost}</span>}
                </div>
                {request.status === "lost" && request.lostReason && <p className="lost-reason-text">Raison : {request.lostReason}</p>}
              </div>

              <div className="notes-section">
                <span className="detail-label">Notes</span>
                {request.notes.length === 0 && <p className="empty-hint">Aucune note pour l'instant.</p>}
                <ul className="notes-list">
                  {request.notes.map((note) => (
                    <li key={note.id}>
                      <div className="note-meta">
                        {note.authorName} · {formatDate(note.createdAt)}
                      </div>
                      <div>{note.body}</div>
                    </li>
                  ))}
                </ul>
                <div className="note-form">
                  <textarea
                    rows={2}
                    placeholder="Ajouter une note…"
                    value={noteBody}
                    onChange={(e) => setNoteBody(e.target.value)}
                  />
                  <button
                    type="button"
                    className="btn btn-secondary"
                    disabled={!noteBody.trim() || noteMutation.isPending}
                    onClick={() => noteMutation.mutate(noteBody)}
                  >
                    Ajouter
                  </button>
                </div>
              </div>
            </>
          )}
        </div>

        <div className="modal-footer">
          <button type="button" className="btn btn-secondary" onClick={onClose}>
            Fermer
          </button>
          {request && (
            <button type="button" className="btn" onClick={() => setOptionsOpen((v) => !v)}>
              ⚙ Options
            </button>
          )}
        </div>
      </div>

      {request && <ClientRequestOptionsMenu request={request} open={optionsOpen} onClose={() => setOptionsOpen(false)} onDeleted={onClose} />}
    </div>
  );
}
