import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { ChecklistCatalogDto } from "./api.js";
import "./settings.css";

interface ChecklistCatalogCardProps {
  title: string;
  description: string;
  queryKey: string;
  fetchFn: () => Promise<ChecklistCatalogDto[]>;
  createFn: (label: string, insertBeforeId?: string) => Promise<ChecklistCatalogDto>;
  updateFn: (id: string, update: { label?: string; active?: boolean }) => Promise<ChecklistCatalogDto>;
}

/**
 * Carte générique Paramètres pour les 3 catalogues du module Checklist de
 * production (épaisseurs/matériaux/étapes, 21 août 2026) — même patron que
 * SalesChannelsCard : ajouter/renommer/désactiver-réactiver, plus (ajout du
 * même jour) une position choisie à l'ajout — un nouveau libellé s'ajoutait
 * toujours à la fin, ce qui forçait par ex. « Coupe » à atterrir après
 * Peinture au lieu de près de Plasma/Pliage.
 */
export function ChecklistCatalogCard({ title, description, queryKey, fetchFn, createFn, updateFn }: ChecklistCatalogCardProps) {
  const queryClient = useQueryClient();
  const listQuery = useQuery({ queryKey: [queryKey], queryFn: fetchFn });
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [newLabel, setNewLabel] = useState("");
  const [insertBeforeId, setInsertBeforeId] = useState("");
  const [error, setError] = useState<string | null>(null);

  const invalidate = () => void queryClient.invalidateQueries({ queryKey: [queryKey] });

  const createMutation = useMutation({
    mutationFn: () => createFn(newLabel.trim(), insertBeforeId || undefined),
    onSuccess: () => {
      setNewLabel("");
      setInsertBeforeId("");
      setError(null);
      invalidate();
    },
    onError: () => setError("Erreur — ce libellé existe peut-être déjà."),
  });
  const updateMutation = useMutation({
    mutationFn: ({ id, update }: { id: string; update: { label?: string; active?: boolean } }) => updateFn(id, update),
    onSuccess: invalidate,
  });

  const items = listQuery.data ?? [];
  const canCreate = newLabel.trim().length > 0 && !createMutation.isPending;

  function draftFor(item: ChecklistCatalogDto): string {
    return drafts[item.id] ?? item.label;
  }

  return (
    <div className="card" style={{ marginTop: 20 }}>
      <h2 style={{ marginTop: 0, fontSize: 16 }}>{title}</h2>
      <p style={{ color: "var(--gsc-color-muted)", fontSize: 13, marginTop: -8 }}>{description}</p>

      <div className="table-scroll">
      <table className="settings-table">
        <thead>
          <tr>
            <th>Libellé</th>
            <th>Statut</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {items.map((item) => {
            const draft = draftFor(item);
            const changed = draft.trim() !== item.label;
            return (
              <tr key={item.id} className={item.active ? "" : "settings-row-inactive"}>
                <td>
                  <input type="text" value={draft} onChange={(event) => setDrafts((current) => ({ ...current, [item.id]: event.target.value }))} />
                </td>
                <td>{item.active ? "Actif" : "Désactivé"}</td>
                <td style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                  {changed && draft.trim().length > 0 && (
                    <button
                      type="button"
                      className="btn btn-secondary btn-small"
                      onClick={() => updateMutation.mutate({ id: item.id, update: { label: draft.trim() } })}
                    >
                      Renommer
                    </button>
                  )}
                  <button type="button" className="btn btn-secondary btn-small" onClick={() => updateMutation.mutate({ id: item.id, update: { active: !item.active } })}>
                    {item.active ? "Désactiver" : "Réactiver"}
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      </div>

      <div style={{ display: "flex", gap: 8, marginTop: 14, alignItems: "center", flexWrap: "wrap" }}>
        <input type="text" placeholder="Nouveau" style={{ maxWidth: 220 }} value={newLabel} onChange={(event) => setNewLabel(event.target.value)} />
        <select value={insertBeforeId} onChange={(event) => setInsertBeforeId(event.target.value)} style={{ maxWidth: 200 }}>
          <option value="">À la fin</option>
          {items.map((item) => (
            <option key={item.id} value={item.id}>
              Avant « {item.label} »
            </option>
          ))}
        </select>
        <button type="button" className="btn" disabled={!canCreate} onClick={() => createMutation.mutate()}>
          + Ajouter
        </button>
      </div>
      {error && <p className="error-text">{error}</p>}
    </div>
  );
}
