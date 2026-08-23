import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { fetchSalesChannels, createSalesChannel, updateSalesChannel, moveSalesChannel, type SalesChannelDto } from "./api.js";
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

  const channels = channelsQuery.data?.salesChannels ?? [];
  const canCreate = newName.trim().length > 0 && !createMutation.isPending;

  function draftFor(channel: SalesChannelDto): string {
    return drafts[channel.id] ?? channel.name;
  }

  return (
    <div className="card" style={{ marginTop: 20 }}>
      <h2 style={{ marginTop: 0, fontSize: 16 }}>Canaux d'entrée des demandes clients</h2>
      <p style={{ color: "var(--gsc-color-muted)", fontSize: 13, marginTop: -8 }}>
        Ajouter, renommer, réordonner, désactiver et réactiver — les canaux déjà utilisés restent dans l'historique.
      </p>

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
                <td style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
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
