import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { fetchProjects, submitPurchaseShortlist, type ShortlistLine } from "./api.js";

const MIN_LINES = 6;

function emptyLines(count: number): ShortlistLine[] {
  return Array.from({ length: count }, () => ({ description: "", supplier: "", estimatedAmountMin: undefined, estimatedAmountMax: undefined }));
}

/**
 * Liste rapide d'achats de projet — ouverte à tous les rôles depuis le 13
 * août 2026 (voir canSubmitPurchaseRequest, roles.ts; à l'origine réservée
 * au Propriétaire/Direction, confirmé le 12 août 2026). Le projet choisi
 * en haut s'applique à toutes les lignes; chaque ligne devient sa propre
 * demande d'achat indépendante une fois soumise, SANS catégorie — donc
 * jamais de double autorisation du Propriétaire, peu importe le montant
 * (voir apps/api/src/modules/purchases).
 */
export function ShortlistForm() {
  const queryClient = useQueryClient();
  const projectsQuery = useQuery({ queryKey: ["projects"], queryFn: fetchProjects });
  const [projectId, setProjectId] = useState("");
  const [lines, setLines] = useState<ShortlistLine[]>(emptyLines(MIN_LINES));
  const [feedback, setFeedback] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: () => {
      const filled = lines.filter((line) => line.description.trim().length > 0);
      return submitPurchaseShortlist(projectId, filled);
    },
    onSuccess: (result) => {
      setFeedback(`${result.purchaseRequests.length} ligne(s) soumise(s) — visibles dans la liste ci-dessous.`);
      setLines(emptyLines(MIN_LINES));
      void queryClient.invalidateQueries({ queryKey: ["purchase-requests"] });
    },
    onError: () => setFeedback("Erreur lors de la soumission — vérifiez les champs et réessayez."),
  });

  function updateLine(index: number, patch: Partial<ShortlistLine>) {
    setLines((current) => current.map((line, i) => (i === index ? { ...line, ...patch } : line)));
  }

  function addLine() {
    setLines((current) => [...current, { description: "", supplier: "" }]);
  }

  const hasAtLeastOneLine = lines.some((line) => line.description.trim().length > 0);
  const canSubmit = projectId !== "" && hasAtLeastOneLine && !mutation.isPending;

  return (
    <div className="card shortlist-form">
      <h2 style={{ marginTop: 0, fontSize: 16 }}>Liste rapide d'achats de projet</h2>
      <p style={{ color: "var(--gsc-color-muted)", fontSize: 13, marginTop: -8 }}>
        Une ligne par article — numéro de pièce ou description courte. Fournisseurs et prix sont facultatifs, modifiables plus tard.
      </p>

      <div className="field">
        <label htmlFor="shortlist-project">Projet (obligatoire)</label>
        <select id="shortlist-project" value={projectId} onChange={(event) => setProjectId(event.target.value)}>
          <option value="">— Choisir un projet —</option>
          {projectsQuery.data?.projects.map((project) => (
            <option key={project.id} value={project.id}>
              {project.projectNumber} — {project.name}
            </option>
          ))}
        </select>
      </div>

      <div className="table-scroll">
      <table className="shortlist-table">
        <thead>
          <tr>
            <th>Description / numéro d'article</th>
            <th>Fournisseur(s) suggéré(s)</th>
            <th>Prix approx. min</th>
            <th>Prix approx. max</th>
          </tr>
        </thead>
        <tbody>
          {lines.map((line, index) => (
            // lignes sans identifiant avant soumission — l'ordre ne change jamais, l'index est stable ici
            <tr key={index}>
              <td>
                <input
                  type="text"
                  placeholder="Ex. Power Supply 120Vac à 12Vdc >30W"
                  value={line.description}
                  onChange={(event) => updateLine(index, { description: event.target.value })}
                />
              </td>
              <td>
                <input
                  type="text"
                  placeholder="Ex. Fournisseur A, Fournisseur B"
                  value={line.supplier ?? ""}
                  onChange={(event) => updateLine(index, { supplier: event.target.value })}
                />
              </td>
              <td>
                <input
                  type="number"
                  min={0}
                  step="0.01"
                  value={line.estimatedAmountMin ?? ""}
                  onChange={(event) => updateLine(index, { estimatedAmountMin: event.target.value ? Number(event.target.value) : undefined })}
                />
              </td>
              <td>
                <input
                  type="number"
                  min={0}
                  step="0.01"
                  value={line.estimatedAmountMax ?? ""}
                  onChange={(event) => updateLine(index, { estimatedAmountMax: event.target.value ? Number(event.target.value) : undefined })}
                />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      </div>

      <div style={{ display: "flex", gap: 10, marginTop: 12, alignItems: "center" }}>
        <button type="button" className="btn btn-secondary" onClick={addLine}>
          + Ajouter une ligne
        </button>
        <button type="button" className="btn" disabled={!canSubmit} onClick={() => mutation.mutate()}>
          {mutation.isPending ? "Soumission…" : "Soumettre la liste"}
        </button>
      </div>
      {feedback && <p style={{ fontSize: 13, marginTop: 10 }}>{feedback}</p>}
    </div>
  );
}
