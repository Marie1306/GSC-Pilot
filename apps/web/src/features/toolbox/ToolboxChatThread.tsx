import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { ApiError } from "../../lib/apiClient.js";
import { CitedText } from "../../components/CitedText.js";
import { fetchToolboxThreadDetail, continueToolboxThread } from "./api.js";
import "./toolbox.css";

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString("fr-CA", { year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

interface ToolboxChatThreadProps {
  threadId: string;
  onClose: () => void;
}

/**
 * Fil de discussion (16 septembre 2026) — nouveau patron pour ce projet
 * (clavardage à tours multiples, jamais un formulaire structuré). N'importe
 * qui peut continuer le fil de n'importe qui (FAQ collective, confirmé) —
 * aucune vérification d'auteur ici, même côté serveur (toolbox/service.ts).
 */
export function ToolboxChatThread({ threadId, onClose }: ToolboxChatThreadProps) {
  const queryClient = useQueryClient();
  const [message, setMessage] = useState("");
  const [error, setError] = useState<string | null>(null);
  const threadQuery = useQuery({ queryKey: ["toolbox-thread", threadId], queryFn: () => fetchToolboxThreadDetail(threadId) });
  const thread = threadQuery.data;

  const continueMutation = useMutation({
    mutationFn: (value: string) => continueToolboxThread(threadId, value),
    onSuccess: () => {
      setMessage("");
      setError(null);
      void queryClient.invalidateQueries({ queryKey: ["toolbox-thread", threadId] });
      void queryClient.invalidateQueries({ queryKey: ["toolbox-threads"] });
    },
    onError: (err: unknown) => setError(err instanceof ApiError ? err.message : "Échec de la réponse — réessayez."),
  });

  return (
    <div className="modal-backdrop">
      <div className="modal" style={{ maxWidth: 700 }}>
        <div className="modal-header">
          <div>
            <h2>{thread ? thread.categoryLabel : "Fil de discussion"}</h2>
            <p className="modal-subtitle">Boîte à outils — FAQ technique citée dans les chartes de référence.</p>
          </div>
          <button type="button" className="modal-close" onClick={onClose} aria-label="Fermer">
            ×
          </button>
        </div>

        <div className="modal-body">
          {!thread && <p>Chargement…</p>}
          {thread && (
            <div className="toolbox-thread">
              {thread.messages.map((msg) => (
                <div key={msg.id} className={`toolbox-message toolbox-message-${msg.role}`}>
                  <div className="note-meta">
                    {msg.role === "assistant" ? "IA" : (msg.authorName ?? "—")} · {formatDateTime(msg.createdAt)}
                  </div>
                  <CitedText content={msg.content} />
                </div>
              ))}
              {continueMutation.isPending && <p className="empty-hint">L'IA répond…</p>}
            </div>
          )}
          {error && <p className="form-error">{error}</p>}
        </div>

        <div className="modal-footer" style={{ flexDirection: "column", alignItems: "stretch", gap: 8 }}>
          <div style={{ display: "flex", gap: 8 }}>
            <textarea
              rows={2}
              placeholder="Continuer la conversation…"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              style={{ flex: 1 }}
            />
            <button type="button" className="btn" disabled={!message.trim() || continueMutation.isPending} onClick={() => continueMutation.mutate(message)}>
              Envoyer
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
