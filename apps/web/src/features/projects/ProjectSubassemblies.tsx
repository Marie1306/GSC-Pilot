import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { canPrepareSubassemblyPartsList, canDeclareAssemblyReady } from "@gsc-pilot/business-rules";
import { useAuth } from "../../lib/auth/useAuth.js";
import { ApiError } from "../../lib/apiClient.js";
import { fetchProjectSubassemblies, declareSubassembly, markPartsListReady, declareAssemblyReady } from "../subassemblies/api.js";

interface ProjectSubassembliesProps {
  projectId: string;
}

const FABRICATION_SUBCATEGORIES = [
  { value: "fabrication-plasma", label: "Fabrication — Plasma" },
  { value: "fabrication-pliage", label: "Fabrication — Pliage" },
  { value: "fabrication-usinage", label: "Fabrication — Usinage" },
  { value: "fabrication-soudage", label: "Fabrication — Soudage" },
  { value: "fabrication-peinture", label: "Fabrication — Peinture" },
  { value: "programmation", label: "Programmation" },
  { value: "assemblage", label: "Assemblage" },
];
const CATEGORY_LABEL = new Map(FABRICATION_SUBCATEGORIES.map((c) => [c.value, c.label]));

const STATUS_LABELS: Record<string, string> = {
  pending_parts_list: "En attente de liste de pièces",
  ready_for_production: "Planifiable en production",
};

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("fr-CA", { year: "numeric", month: "short", day: "numeric" });
}

interface HoursRow {
  category: string;
  hours: string;
}
const emptyRow = (): HoursRow => ({ category: FABRICATION_SUBCATEGORIES[0]!.value, hours: "" });

/**
 * Sous-assemblages (21 août 2026) — réutilise subassembly.ts tel quel côté
 * serveur. Déclarer reste ouvert à tout employé (geste de terrain, pas une
 * approbation); créer la liste de pièces et déclarer l'assemblage prêt
 * restent Direction seulement (spec confirmée).
 */
export function ProjectSubassemblies({ projectId }: ProjectSubassembliesProps) {
  const { employee } = useAuth();
  const queryClient = useQueryClient();
  const listQuery = useQuery({ queryKey: ["subassemblies", projectId], queryFn: () => fetchProjectSubassemblies(projectId) });
  const [newNumber, setNewNumber] = useState("");
  const [partsListForId, setPartsListForId] = useState<string | null>(null);
  const [rows, setRows] = useState<HoursRow[]>([emptyRow()]);
  const [error, setError] = useState<string | null>(null);

  const invalidate = () => {
    setError(null);
    void queryClient.invalidateQueries({ queryKey: ["subassemblies", projectId] });
    void queryClient.invalidateQueries({ queryKey: ["action-center"] });
  };
  const onMutationError = (err: unknown) => setError(err instanceof ApiError ? err.message : "Une erreur est survenue — réessayez.");

  const declareMutation = useMutation({
    mutationFn: () => declareSubassembly(projectId, newNumber.trim()),
    onSuccess: () => {
      setNewNumber("");
      invalidate();
    },
    onError: onMutationError,
  });
  const partsListMutation = useMutation({
    mutationFn: (hoursByCategory: Record<string, number>) => markPartsListReady(partsListForId!, hoursByCategory),
    onSuccess: () => {
      setPartsListForId(null);
      setRows([emptyRow()]);
      invalidate();
    },
    onError: onMutationError,
  });
  const assemblyMutation = useMutation({ mutationFn: declareAssemblyReady, onSuccess: invalidate, onError: onMutationError });

  if (!employee) return null;
  const canPrepare = canPrepareSubassemblyPartsList(employee.persona);
  const canAssembly = canDeclareAssemblyReady(employee.persona);
  const subassemblies = listQuery.data?.subassemblies ?? [];

  function submitPartsList() {
    const hoursByCategory: Record<string, number> = {};
    for (const row of rows) {
      const hours = Number(row.hours);
      if (row.category && hours > 0) hoursByCategory[row.category] = hours;
    }
    if (Object.keys(hoursByCategory).length === 0) {
      setError("Au moins une catégorie d'heures est requise.");
      return;
    }
    partsListMutation.mutate(hoursByCategory);
  }

  return (
    <div className="card" style={{ marginBottom: 20 }}>
      <h3 style={{ margin: 0, fontSize: 15 }}>Sous-assemblages</h3>
      <p style={{ margin: "4px 0 10px", color: "var(--gsc-color-muted)", fontSize: 13 }}>
        Le designer déclare un sous-assemblage dès qu'il est vraiment prêt (numéro libre, sa propre logique d'ingénierie) — aucune
        description requise. Direction crée ensuite la liste de pièces (heures réelles) pour le rendre planifiable en production.
      </p>

      {error && <p className="form-error">{error}</p>}

      <form
        style={{ display: "flex", gap: 8, marginBottom: 14 }}
        onSubmit={(event) => {
          event.preventDefault();
          if (newNumber.trim()) declareMutation.mutate();
        }}
      >
        <input placeholder="Numéro (ex. 08-000)" value={newNumber} onChange={(e) => setNewNumber(e.target.value)} style={{ maxWidth: 220 }} />
        <button type="submit" className="btn btn-small" disabled={!newNumber.trim() || declareMutation.isPending}>
          {declareMutation.isPending ? "…" : "Déclarer prêt"}
        </button>
      </form>

      {subassemblies.length === 0 ? (
        <p style={{ color: "var(--gsc-color-muted)", fontSize: 13 }}>Aucun sous-assemblage déclaré.</p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {subassemblies.map((sa) => (
            <div key={sa.id} className="card" style={{ background: "var(--gsc-color-surface2)", border: "none" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
                <div>
                  <strong>{sa.number}</strong>
                  <div className="cell-sub">
                    Déclaré par {sa.declaredByName} · {formatDate(sa.declaredAt)}
                  </div>
                </div>
                <span className={`badge-pill ${sa.status === "ready_for_production" ? "badge-conforme" : "badge-neutral"}`}>
                  {STATUS_LABELS[sa.status]}
                </span>
              </div>

              {sa.hoursByCategory && (
                <div className="cell-sub" style={{ marginTop: 8 }}>
                  {Object.entries(sa.hoursByCategory)
                    .map(([cat, h]) => `${CATEGORY_LABEL.get(cat) ?? cat} : ${h} h`)
                    .join(" · ")}
                </div>
              )}
              {sa.assemblyReadyDeclaredByName && (
                <div className="cell-sub" style={{ marginTop: 4 }}>
                  Assemblage déclaré prêt par {sa.assemblyReadyDeclaredByName} · {formatDate(sa.assemblyReadyDeclaredAt!)}
                </div>
              )}

              {sa.status === "pending_parts_list" && canPrepare && partsListForId !== sa.id && (
                <button type="button" className="btn btn-small" style={{ marginTop: 10 }} onClick={() => setPartsListForId(sa.id)}>
                  Créer la liste de pièces
                </button>
              )}

              {partsListForId === sa.id && (
                <div style={{ marginTop: 10 }}>
                  {rows.map((row, index) => (
                    <div key={index} style={{ display: "flex", gap: 8, marginBottom: 6 }}>
                      <select
                        value={row.category}
                        onChange={(e) => setRows(rows.map((r, i) => (i === index ? { ...r, category: e.target.value } : r)))}
                        style={{ flex: 1 }}
                      >
                        {FABRICATION_SUBCATEGORIES.map((c) => (
                          <option key={c.value} value={c.value}>
                            {c.label}
                          </option>
                        ))}
                      </select>
                      <input
                        type="number"
                        min={0}
                        step="0.1"
                        placeholder="Heures"
                        value={row.hours}
                        onChange={(e) => setRows(rows.map((r, i) => (i === index ? { ...r, hours: e.target.value } : r)))}
                        style={{ width: 100 }}
                      />
                      <button
                        type="button"
                        className="icon-btn"
                        title="Retirer"
                        onClick={() => setRows(rows.filter((_, i) => i !== index))}
                        disabled={rows.length === 1}
                      >
                        ×
                      </button>
                    </div>
                  ))}
                  <div style={{ display: "flex", gap: 8 }}>
                    <button type="button" className="btn btn-secondary btn-small" onClick={() => setRows([...rows, emptyRow()])}>
                      + Catégorie
                    </button>
                    <button type="button" className="btn btn-small" disabled={partsListMutation.isPending} onClick={submitPartsList}>
                      {partsListMutation.isPending ? "…" : "Confirmer la liste de pièces"}
                    </button>
                    <button type="button" className="btn btn-secondary btn-small" onClick={() => setPartsListForId(null)}>
                      Annuler
                    </button>
                  </div>
                </div>
              )}

              {sa.status === "ready_for_production" &&
                !sa.assemblyReadyDeclaredByName &&
                sa.hoursByCategory?.assemblage !== undefined &&
                canAssembly && (
                  <button
                    type="button"
                    className="btn btn-small"
                    style={{ marginTop: 10 }}
                    disabled={assemblyMutation.isPending}
                    onClick={() => assemblyMutation.mutate(sa.id)}
                  >
                    Déclarer l'assemblage prêt
                  </button>
                )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
