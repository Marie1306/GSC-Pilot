import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { fetchSalesChannels, createSalesChannel, updateSalesChannel, deleteSalesChannel, moveSalesChannel, type SalesChannelDto } from "./api.js";
import "./settings.css";

/**
 * Canaux d'entrée des demandes clients (SalesChannel) — confirmé,
 * spécification : « configurables/ajoutables par Direction seulement ».
 * Tous les canaux sont listés ici (même désactivés) : l'historique de
 * conversion ne doit jamais disparaître (voir Rapports).
 */
export function SalesChannelsCard() {
  const queryClient = useQueryClient();
  const channelsQuery = useQuery({ queryKey: ["sales-channels"], queryFn: fetchSalesChannels });
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [newName, setNewName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const invalidate = () => void queryClient.invalidateQueries({ queryKey: ["sales-channels"] });

  const createMutation = useMutation({
    mutationFn: () => createSalesChannel(newName.trim()),
    onSuccess: () => {
      setNewName("");
      setError(null);
      invalidate();
    },
    onError: () => setError("Erreur — ce nom existe peut-être déjà."),
  });
  const updateMutation = useMutation({
    mutationFn: ({ id, update }: { id: string; update: { name?: string; active?: boolean } }) => updateSalesChannel(id, update),
    onSuccess: invalidate,
  });
  const moveMutation = useMutation({
    mutationFn: ({ id, direction }: { id: string; direction: "up" | "down" }) => moveSalesChannel(id, direction),
    onSuccess: invalidate,
  });
  const deleteMutation = useMutation({
    mutationFn: deleteSalesChannel,
    onSuccess: () => {
      setConfirmDeleteId(null);
      invalidate();
    },
  });

  const channels = channelsQuery.data?.salesChannels ?? [];
  const canCreate = newName.trim().length > 0 && !createMutation.isPending;

  function draftFor(channel: SalesChannelDto): string {
    return drafts[channel.id] ?? channel.name;
  }

  return (
    <div className="card" style={{ marginTop: 20 }}>
      <div className="card-band-header">
        <div>
          <h3>Canaux d'entrée des demandes clients</h3>
          <p className="modal-subtitle">Ajouter, renommer, réordonner, désactiver, réactiver ou supprimer définitivement.</p>
        </div>
      </div>

      <div className="table-scroll">
      <table className="settings-table">
        <thead>
          <tr>
            <th>Canal</th>
            <th>Statut</th>
            <th>Ordre</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {channels.map((channel, index) => {
            const draft = draftFor(channel);
            const changed = draft.trim() !== channel.name;
            return (
              <tr key={channel.id} className={channel.active ? "" : "settings-row-inactive"}>
                <td>
                  <input
                    type="text"
                    value={draft}
                    onChange={(event) => setDrafts((current) => ({ ...current, [channel.id]: event.target.value }))}
                  />
                </td>
                <td>{channel.active ? "Actif" : "Désactivé"}</td>
                <td>{channel.sortOrder + 1}</td>
                <td style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
                  {confirmDeleteId === channel.id ? (
                    <>
                      <span style={{ fontSize: 12, color: "var(--gsc-color-muted)" }}>
                        Supprimer définitivement ? Si déjà utilisé, l'historique perdra ce lien.
                      </span>
                      <button
                        type="button"
                        className="btn btn-small"
                        disabled={deleteMutation.isPending}
                        onClick={() => deleteMutation.mutate(channel.id)}
                      >
                        {deleteMutation.isPending ? "…" : "Confirmer"}
                      </button>
                      <button type="button" className="btn btn-secondary btn-small" onClick={() => setConfirmDeleteId(null)}>
                        Annuler
                      </button>
                    </>
                  ) : (
                    <>
                      <button
                        type="button"
                        className="btn btn-secondary btn-small"
                        disabled={index === 0 || moveMutation.isPending}
                        onClick={() => moveMutation.mutate({ id: channel.id, direction: "up" })}
                      >
                        ↑
                      </button>
                      <button
                        type="button"
                        className="btn btn-secondary btn-small"
                        disabled={index === channels.length - 1 || moveMutation.isPending}
                        onClick={() => moveMutation.mutate({ id: channel.id, direction: "down" })}
                      >
                        ↓
                      </button>
                      {changed && draft.trim().length > 0 && (
                        <button
                          type="button"
                          className="btn btn-secondary btn-small"
                          onClick={() => updateMutation.mutate({ id: channel.id, update: { name: draft.trim() } })}
                        >
                          Renommer
                        </button>
                      )}
                      <button
                        type="button"
                        className="btn btn-secondary btn-small"
                        onClick={() => updateMutation.mutate({ id: channel.id, update: { active: !channel.active } })}
                      >
                        {channel.active ? "Désactiver" : "Réactiver"}
                      </button>
                      <button type="button" className="btn btn-secondary btn-small" onClick={() => setConfirmDeleteId(channel.id)}>
                        Supprimer
                      </button>
                    </>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      </div>

      <div style={{ display: "flex", gap: 8, marginTop: 14, alignItems: "center" }}>
        <input type="text" placeholder="Nouveau canal" style={{ maxWidth: 220 }} value={newName} onChange={(event) => setNewName(event.target.value)} />
        <button type="button" className="btn" disabled={!canCreate} onClick={() => createMutation.mutate()}>
          + Ajouter
        </button>
      </div>
      {error && <p className="error-text">{error}</p>}
    </div>
  );
}
