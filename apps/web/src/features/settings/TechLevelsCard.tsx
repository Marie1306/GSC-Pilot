import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { fetchTechLevels, createTechLevel, updateTechLevel, type TechLevelDto } from "./api.js";
import "./settings.css";

interface Draft {
  label: string;
  regularRate: string;
  overtimeRate: string;
  extraRate: string;
}

function draftFrom(techLevel: TechLevelDto): Draft {
  return {
    label: techLevel.label,
    regularRate: String(techLevel.regularRate),
    overtimeRate: String(techLevel.overtimeRate),
    extraRate: String(techLevel.extraRate),
  };
}

/**
 * Classes facturables en service (TechLevel) — confirmé le 18 août 2026.
 * Trois taux par classe (régulier/temps supplémentaire/extra) : la classe
 * réellement facturée se choisit à chaque punch, pas fixée une fois pour
 * toutes. Un même employé peut avoir plusieurs classes applicables (ex.
 * programmeur ET technicien senior) — assignation par employé maintenant
 * dans sa propre fiche (Utilisateurs et employés actifs), pas ici. Part
 * vide : aucun taux n'est deviné, Direction entre ses vraies classes/taux.
 */
export function TechLevelsCard() {
  const queryClient = useQueryClient();
  const techLevelsQuery = useQuery({ queryKey: ["tech-levels"], queryFn: fetchTechLevels });

  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [newDraft, setNewDraft] = useState<Draft>({ label: "", regularRate: "", overtimeRate: "", extraRate: "" });
  const [error, setError] = useState<string | null>(null);

  const invalidateTechLevels = () => void queryClient.invalidateQueries({ queryKey: ["tech-levels"] });

  const createMutation = useMutation({
    mutationFn: () =>
      createTechLevel({
        label: newDraft.label.trim(),
        regularRate: Number(newDraft.regularRate),
        overtimeRate: Number(newDraft.overtimeRate),
        extraRate: Number(newDraft.extraRate),
      }),
    onSuccess: () => {
      setNewDraft({ label: "", regularRate: "", overtimeRate: "", extraRate: "" });
      setError(null);
      invalidateTechLevels();
    },
    onError: () => setError("Erreur — ce nom existe peut-être déjà."),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, update }: { id: string; update: Partial<TechLevelDto> }) => updateTechLevel(id, update),
    onSuccess: invalidateTechLevels,
  });

  const techLevels = techLevelsQuery.data?.techLevels ?? [];

  function draftFor(techLevel: TechLevelDto): Draft {
    return drafts[techLevel.id] ?? draftFrom(techLevel);
  }
  function setDraft(techLevel: TechLevelDto, patch: Partial<Draft>) {
    setDrafts((current) => ({ ...current, [techLevel.id]: { ...draftFor(techLevel), ...patch } }));
  }
  function hasChanged(techLevel: TechLevelDto): boolean {
    const draft = draftFor(techLevel);
    return (
      draft.label !== techLevel.label ||
      Number(draft.regularRate) !== techLevel.regularRate ||
      Number(draft.overtimeRate) !== techLevel.overtimeRate ||
      Number(draft.extraRate) !== techLevel.extraRate
    );
  }
  function draftValid(draft: Draft): boolean {
    return (
      draft.label.trim().length > 0 &&
      [draft.regularRate, draft.overtimeRate, draft.extraRate].every((value) => value.trim().length > 0 && Number(value) >= 0)
    );
  }

  const canCreate = draftValid(newDraft) && !createMutation.isPending;

  return (
    <div className="card" style={{ marginTop: 20 }}>
      <div className="card-band-header">
        <div>
          <h3>Classes de service</h3>
          <p className="modal-subtitle">
            Utilisées au punch sur un call de service. La classe et le type de temps (régulier/temps supplémentaire/extra) se choisissent
            à chaque punch, parmi les classes assignées à l'employé (voir sa fiche, Utilisateurs et employés actifs).
          </p>
        </div>
      </div>

      <div className="table-scroll">
      <table className="settings-table">
        <thead>
          <tr>
            <th>Classe</th>
            <th>Régulier ($/h)</th>
            <th>Temps sup. ($/h)</th>
            <th>Extra ($/h)</th>
            <th>Statut</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {techLevels.map((techLevel) => {
            const draft = draftFor(techLevel);
            const changed = hasChanged(techLevel);
            return (
              <tr key={techLevel.id} className={techLevel.active ? "" : "settings-row-inactive"}>
                <td>
                  <input type="text" value={draft.label} onChange={(event) => setDraft(techLevel, { label: event.target.value })} />
                </td>
                <td>
                  <input
                    type="number"
                    min={0}
                    step="0.01"
                    style={{ maxWidth: 100 }}
                    value={draft.regularRate}
                    onChange={(event) => setDraft(techLevel, { regularRate: event.target.value })}
                  />
                </td>
                <td>
                  <input
                    type="number"
                    min={0}
                    step="0.01"
                    style={{ maxWidth: 100 }}
                    value={draft.overtimeRate}
                    onChange={(event) => setDraft(techLevel, { overtimeRate: event.target.value })}
                  />
                </td>
                <td>
                  <input
                    type="number"
                    min={0}
                    step="0.01"
                    style={{ maxWidth: 100 }}
                    value={draft.extraRate}
                    onChange={(event) => setDraft(techLevel, { extraRate: event.target.value })}
                  />
                </td>
                <td>{techLevel.active ? "Active" : "Désactivée"}</td>
                <td style={{ display: "flex", gap: 6 }}>
                  {changed && draftValid(draft) && (
                    <button
                      type="button"
                      className="btn btn-secondary"
                      onClick={() =>
                        updateMutation.mutate({
                          id: techLevel.id,
                          update: {
                            label: draft.label.trim(),
                            regularRate: Number(draft.regularRate),
                            overtimeRate: Number(draft.overtimeRate),
                            extraRate: Number(draft.extraRate),
                          },
                        })
                      }
                    >
                      Enregistrer
                    </button>
                  )}
                  <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={() => updateMutation.mutate({ id: techLevel.id, update: { active: !techLevel.active } })}
                  >
                    {techLevel.active ? "Désactiver" : "Réactiver"}
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      </div>

      <div style={{ display: "flex", gap: 8, marginTop: 14, alignItems: "center", flexWrap: "wrap" }}>
        <input
          type="text"
          placeholder="Nouvelle classe (ex. Technicien senior)"
          style={{ maxWidth: 220 }}
          value={newDraft.label}
          onChange={(event) => setNewDraft((current) => ({ ...current, label: event.target.value }))}
        />
        <input
          type="number"
          min={0}
          step="0.01"
          placeholder="Régulier ($/h)"
          style={{ maxWidth: 130 }}
          value={newDraft.regularRate}
          onChange={(event) => setNewDraft((current) => ({ ...current, regularRate: event.target.value }))}
        />
        <input
          type="number"
          min={0}
          step="0.01"
          placeholder="Temps sup. ($/h)"
          style={{ maxWidth: 130 }}
          value={newDraft.overtimeRate}
          onChange={(event) => setNewDraft((current) => ({ ...current, overtimeRate: event.target.value }))}
        />
        <input
          type="number"
          min={0}
          step="0.01"
          placeholder="Extra ($/h)"
          style={{ maxWidth: 130 }}
          value={newDraft.extraRate}
          onChange={(event) => setNewDraft((current) => ({ ...current, extraRate: event.target.value }))}
        />
        <button type="button" className="btn" disabled={!canCreate} onClick={() => createMutation.mutate()}>
          + Ajouter
        </button>
      </div>
      {error && <p className="error-text">{error}</p>}
    </div>
  );
}
