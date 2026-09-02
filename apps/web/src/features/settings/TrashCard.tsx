import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ApiError } from "../../lib/apiClient.js";
import { fetchTrash, restoreTrashItem, type TrashEntityType } from "./api.js";
import "./settings.css";

const ENTITY_TYPE_LABELS: Record<TrashEntityType, string> = {
  project: "Projet",
  clientRequest: "Demande client",
  budget: "Budgétaire",
  serviceCall: "Appel de service",
  rolling: "Roulement",
  timeEntry: "Punch",
  errorReport: "Rapport d'erreur",
};

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString("fr-CA", { year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

/**
 * Corbeille (2 septembre 2026) — vue + restauration seulement, jamais une
 * suppression définitive (voir trash.ts, backend, pour la portée exacte de
 * la restauration — en particulier le lien budgétaire↔demande client qui
 * n'est pas automatiquement refait).
 */
export function TrashCard() {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const queryClient = useQueryClient();
  const trashQuery = useQuery({ queryKey: ["trash"], queryFn: fetchTrash, enabled: open });
  const items = trashQuery.data?.items ?? [];

  const restoreMutation = useMutation({
    mutationFn: ({ entityType, id }: { entityType: TrashEntityType; id: string }) => restoreTrashItem(entityType, id),
    onSuccess: () => {
      setError(null);
      void queryClient.invalidateQueries({ queryKey: ["trash"] });
    },
    onError: (err: unknown) => setError(err instanceof ApiError ? err.message : "Erreur lors de la restauration."),
  });

  return (
    <div className="card" style={{ marginTop: 20 }}>
      <div className="card-band-header">
        <div>
          <h3>Corbeille</h3>
          <p className="modal-subtitle">Éléments supprimés — projets, demandes, budgétaires, appels de service, roulements, punchs, rapports d'erreur.</p>
        </div>
      </div>

      <button type="button" className="btn btn-secondary" onClick={() => setOpen((current) => !current)}>
        {open ? "Fermer la corbeille" : "Ouvrir la corbeille"}
      </button>

      {error && <p className="form-error">{error}</p>}

      {open && (
        <div style={{ marginTop: 12 }} className="table-scroll">
          {trashQuery.isLoading ? (
            <p style={{ color: "var(--gsc-color-muted)", fontSize: 13 }}>Chargement…</p>
          ) : items.length === 0 ? (
            <p style={{ color: "var(--gsc-color-muted)", fontSize: 13 }}>La corbeille est vide.</p>
          ) : (
            <table className="audit-log-table">
              <thead>
                <tr>
                  <th>Type</th>
                  <th>Élément</th>
                  <th>Supprimé le</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {items.map((item) => (
                  <tr key={`${item.entityType}-${item.id}`}>
                    <td>{ENTITY_TYPE_LABELS[item.entityType]}</td>
                    <td>{item.label}</td>
                    <td>{formatDate(item.deletedAt)}</td>
                    <td>
                      <button
                        type="button"
                        className="btn btn-small"
                        disabled={restoreMutation.isPending}
                        onClick={() => restoreMutation.mutate({ entityType: item.entityType, id: item.id })}
                      >
                        Restaurer
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  );
}
