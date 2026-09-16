import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { addSeaoNote, type SeaoNoteDto } from "./api.js";

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("fr-CA", { year: "numeric", month: "short", day: "numeric" });
}

/** Journal de notes — même patron/classes que ClientRequestDetail.tsx (.notes-list/.note-meta/.note-form), jamais réinventé. */
export function SeaoNotes({ seaoFileId, notes }: { seaoFileId: string; notes: SeaoNoteDto[] }) {
  const queryClient = useQueryClient();
  const [body, setBody] = useState("");

  const noteMutation = useMutation({
    mutationFn: (value: string) => addSeaoNote(seaoFileId, value),
    onSuccess: () => {
      setBody("");
      void queryClient.invalidateQueries({ queryKey: ["seao-file", seaoFileId] });
    },
  });

  return (
    <div>
      <span className="detail-label">Notes</span>
      {notes.length === 0 && <p className="empty-hint">Aucune note pour l'instant.</p>}
      <ul className="notes-list">
        {notes.map((note) => (
          <li key={note.id}>
            <div className="note-meta">
              {note.authorName} · {formatDate(note.createdAt)}
            </div>
            <div>{note.body}</div>
          </li>
        ))}
      </ul>
      <div className="note-form">
        <textarea rows={2} placeholder="Ajouter une note…" value={body} onChange={(e) => setBody(e.target.value)} />
        <button type="button" className="btn btn-secondary" disabled={!body.trim() || noteMutation.isPending} onClick={() => noteMutation.mutate(body)}>
          Ajouter
        </button>
      </div>
    </div>
  );
}
