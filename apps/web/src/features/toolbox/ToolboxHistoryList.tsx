import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { ApiError } from "../../lib/apiClient.js";
import { fetchToolboxThreads, startToolboxThread } from "./api.js";

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString("fr-CA", { year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

interface ToolboxHistoryListProps {
  categoryId: string;
  onOpenThread: (id: string) => void;
}

/** FAQ collective d'une catégorie — fils triés par activité récente (voir toolbox/service.ts) + poser une nouvelle question. */
export function ToolboxHistoryList({ categoryId, onOpenThread }: ToolboxHistoryListProps) {
  const queryClient = useQueryClient();
  const [message, setMessage] = useState("");
  const [error, setError] = useState<string | null>(null);
  const threadsQuery = useQuery({ queryKey: ["toolbox-threads", categoryId], queryFn: () => fetchToolboxThreads(categoryId) });
  const threads = threadsQuery.data?.threads ?? [];

  const startMutation = useMutation({
    mutationFn: () => startToolboxThread(categoryId, message.trim()),
    onSuccess: ({ id }) => {
      setMessage("");
      setError(null);
      void queryClient.invalidateQueries({ queryKey: ["toolbox-threads", categoryId] });
      onOpenThread(id);
    },
    onError: (err: unknown) => setError(err instanceof ApiError ? err.message : "Échec de la question — réessayez."),
  });

  return (
    <div style={{ marginTop: 20 }}>
      <h3 style={{ fontSize: 15, marginBottom: 4 }}>Poser une question</h3>
      {error && <p className="form-error">{error}</p>}
      <div className="note-form">
        <textarea rows={2} placeholder="Votre question…" value={message} onChange={(e) => setMessage(e.target.value)} />
        <button type="button" className="btn" disabled={!message.trim() || startMutation.isPending} onClick={() => startMutation.mutate()}>
          {startMutation.isPending ? "…" : "Demander"}
        </button>
      </div>

      <h3 style={{ fontSize: 15, margin: "20px 0 4px" }}>Questions déjà posées</h3>
      {threads.length === 0 && <p className="empty-hint">Aucune question pour l'instant dans cette catégorie.</p>}
      {threads.length > 0 && (
        <ul className="notes-list">
          {threads.map((thread) => (
            <li key={thread.id} style={{ cursor: "pointer" }} onClick={() => onOpenThread(thread.id)}>
              <div>{thread.firstQuestion}</div>
              <div className="note-meta">
                {thread.startedByName} · dernière activité {formatDateTime(thread.lastMessageAt)}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
