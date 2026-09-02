import { useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ApiError } from "../../lib/apiClient.js";
import { fetchTeamNoteRecipients, sendTeamNote, PERSONA_LABELS, ALL_PERSONAS } from "./api.js";

interface SendNoteModalProps {
  onClose: () => void;
}

const ROLE_PREFIX = "role:";
const EMPLOYEE_PREFIX = "employee:";

/**
 * Envoyer une note (29 août 2026, demande de l'utilisatrice) — à un employé
 * précis OU à tout un rôle à la fois (chaque personne du rôle reçoit alors
 * sa propre copie, voir teamNotes/service.ts). Ouverte depuis Ajouter
 * rapidement (via /centre-actions?compose=note, voir ActionCenterPage.tsx)
 * — accessible à tous les rôles, aucune permission ici.
 */
export function SendNoteModal({ onClose }: SendNoteModalProps) {
  const queryClient = useQueryClient();
  const recipientsQuery = useQuery({ queryKey: ["team-notes", "recipients"], queryFn: fetchTeamNoteRecipients });
  const recipients = recipientsQuery.data?.employees ?? [];
  const [target, setTarget] = useState("");
  const [body, setBody] = useState("");
  const [error, setError] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: () =>
      sendTeamNote(
        target.startsWith(ROLE_PREFIX)
          ? { recipientPersona: target.slice(ROLE_PREFIX.length) as (typeof ALL_PERSONAS)[number], body: body.trim() }
          : { recipientId: target.slice(EMPLOYEE_PREFIX.length), body: body.trim() },
      ),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["team-notes", "inbox"] });
      onClose();
    },
    onError: (err) => setError(err instanceof ApiError ? err.message : "Une erreur est survenue — réessayez."),
  });

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    if (!target || !body.trim()) return;
    mutation.mutate();
  }

  return (
    <div className="modal-backdrop">
      <div className="modal" onClick={(event) => event.stopPropagation()}>
        <div className="modal-header">
          <div>
            <h2>✉️ Envoyer une note</h2>
            <p className="modal-subtitle">À un employé précis ou à tout un rôle.</p>
          </div>
          <button type="button" className="modal-close" onClick={onClose} aria-label="Fermer">
            ×
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="modal-body form-grid">
            <div className="field field-full">
              <label htmlFor="note-target">Destinataire</label>
              <select id="note-target" required value={target} onChange={(e) => setTarget(e.target.value)} autoFocus>
                <option value="" disabled>
                  — Choisir —
                </option>
                <optgroup label="Rôle (tous les membres actifs)">
                  {ALL_PERSONAS.map((persona) => (
                    <option key={`${ROLE_PREFIX}${persona}`} value={`${ROLE_PREFIX}${persona}`}>
                      {PERSONA_LABELS[persona]}
                    </option>
                  ))}
                </optgroup>
                <optgroup label="Employé précis">
                  {recipients.map((recipient) => (
                    <option key={`${EMPLOYEE_PREFIX}${recipient.id}`} value={`${EMPLOYEE_PREFIX}${recipient.id}`}>
                      {recipient.name} ({PERSONA_LABELS[recipient.persona]})
                    </option>
                  ))}
                </optgroup>
              </select>
            </div>
            <div className="field field-full">
              <label htmlFor="note-body">Message</label>
              <textarea id="note-body" rows={5} required value={body} onChange={(e) => setBody(e.target.value)} placeholder="Écrire le message…" />
            </div>
          </div>

          {error && <p className="form-error">{error}</p>}

          <div className="modal-footer">
            <button type="submit" className="btn" disabled={!target || !body.trim() || mutation.isPending}>
              {mutation.isPending ? "Envoi…" : "Envoyer"}
            </button>
            <button type="button" className="btn btn-secondary" onClick={onClose}>
              Annuler
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
