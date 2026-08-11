import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { fetchPurchaseCategories, createPurchaseCategory, updatePurchaseCategory, type PurchaseCategoryDto } from "./api.js";
import "./settings.css";

/**
 * Catégories d'achat — confirmé le 12 août 2026. Utilisées par la demande
 * d'achat régulière (jamais la liste rapide de projet, qui n'a aucune
 * catégorie par choix). Un changement de seuil ne s'applique jamais à une
 * demande déjà en attente — voir thresholdAmountAtSubmission côté serveur.
 */
export function PurchaseCategoriesCard() {
  const queryClient = useQueryClient();
  const categoriesQuery = useQuery({ queryKey: ["purchase-categories"], queryFn: fetchPurchaseCategories });
  const [drafts, setDrafts] = useState<Record<string, { name: string; thresholdAmount: string }>>({});
  const [newName, setNewName] = useState("");
  const [newThreshold, setNewThreshold] = useState("");
  const [error, setError] = useState<string | null>(null);

  const invalidate = () => void queryClient.invalidateQueries({ queryKey: ["purchase-categories"] });

  const createMutation = useMutation({
    mutationFn: () => createPurchaseCategory(newName.trim(), Number(newThreshold)),
    onSuccess: () => {
      setNewName("");
      setNewThreshold("");
      setError(null);
      invalidate();
    },
    onError: () => setError("Erreur — ce nom existe peut-être déjà."),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, update }: { id: string; update: { name?: string; thresholdAmount?: number; active?: boolean } }) =>
      updatePurchaseCategory(id, update),
    onSuccess: invalidate,
  });

  function draftFor(category: PurchaseCategoryDto): { name: string; thresholdAmount: string } {
    return drafts[category.id] ?? { name: category.name, thresholdAmount: String(category.thresholdAmount) };
  }

  function setDraft(category: PurchaseCategoryDto, patch: Partial<{ name: string; thresholdAmount: string }>) {
    setDrafts((current) => ({ ...current, [category.id]: { ...draftFor(category), ...patch } }));
  }

  const categories = categoriesQuery.data?.categories ?? [];
  const canCreate = newName.trim().length > 0 && newThreshold.trim().length > 0 && !createMutation.isPending;

  return (
    <div className="card" style={{ marginTop: 20 }}>
      <h2 style={{ marginTop: 0, fontSize: 16 }}>Catégories d'achat</h2>
      <p style={{ color: "var(--gsc-color-muted)", fontSize: 13, marginTop: -8 }}>
        Utilisées par la demande d'achat régulière. Un seuil est requis pour chaque catégorie — au-delà, le Propriétaire doit aussi
        approuver. Changer un seuil n'affecte jamais une demande déjà en attente.
      </p>

      <table className="settings-table">
        <thead>
          <tr>
            <th>Nom</th>
            <th>Seuil ($)</th>
            <th>Statut</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {categories.map((category) => {
            const draft = draftFor(category);
            const changed = draft.name !== category.name || Number(draft.thresholdAmount) !== category.thresholdAmount;
            return (
              <tr key={category.id} className={category.active ? "" : "settings-row-inactive"}>
                <td>
                  <input type="text" value={draft.name} onChange={(event) => setDraft(category, { name: event.target.value })} />
                </td>
                <td>
                  <input
                    type="number"
                    min={0}
                    step="0.01"
                    value={draft.thresholdAmount}
                    onChange={(event) => setDraft(category, { thresholdAmount: event.target.value })}
                  />
                </td>
                <td>{category.active ? "Active" : "Désactivée"}</td>
                <td style={{ display: "flex", gap: 6 }}>
                  {changed && (
                    <button
                      type="button"
                      className="btn btn-secondary"
                      disabled={draft.name.trim().length === 0 || draft.thresholdAmount.trim().length === 0}
                      onClick={() =>
                        updateMutation.mutate({
                          id: category.id,
                          update: { name: draft.name.trim(), thresholdAmount: Number(draft.thresholdAmount) },
                        })
                      }
                    >
                      Enregistrer
                    </button>
                  )}
                  <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={() => updateMutation.mutate({ id: category.id, update: { active: !category.active } })}
                  >
                    {category.active ? "Désactiver" : "Réactiver"}
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      <div style={{ display: "flex", gap: 8, marginTop: 14, alignItems: "center" }}>
        <input
          type="text"
          placeholder="Nouvelle catégorie"
          style={{ maxWidth: 220 }}
          value={newName}
          onChange={(event) => setNewName(event.target.value)}
        />
        <input
          type="number"
          min={0}
          step="0.01"
          placeholder="Seuil ($)"
          style={{ maxWidth: 120 }}
          value={newThreshold}
          onChange={(event) => setNewThreshold(event.target.value)}
        />
        <button type="button" className="btn" disabled={!canCreate} onClick={() => createMutation.mutate()}>
          + Ajouter
        </button>
      </div>
      {error && <p className="error-text">{error}</p>}
    </div>
  );
}
