import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { canDeclareSubassembly, canPrepareSubassemblyPartsList, canDeclareAssemblyReady } from "@gsc-pilot/business-rules";
import { useAuth } from "../../lib/auth/useAuth.js";
import { ApiError } from "../../lib/apiClient.js";
import {
  fetchProjectSubassemblies,
  fetchRemainingHoursByCategory,
  declareSubassembly,
  markPartsListReady,
  declareAssemblyReady,
} from "../subassemblies/api.js";

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

function emptyHours(): Record<string, string> {
  return Object.fromEntries(FABRICATION_SUBCATEGORIES.map((c) => [c.value, ""]));
}

/**
 * Assemblages (21 août 2026, terme affiché renommé le 31 août 2026 — demande
 * explicite de l'utilisatrice, « sous-assemblage » réservé au module
 * Checklist désormais) — réutilise subassembly.ts tel quel côté serveur
 * (types/fonctions internes inchangés, voir CLAUDE.md). Déclarer reste
 * Propriétaire seulement (Marc, le seul designer — canDeclareSubassembly,
 * corrigé le 21 août 2026); créer la liste de pièces et déclarer l'assemblage
 * prêt (geste distinct de Direction, jamais renommé — spec confirmée)
 * restent Direction seulement.
 */
export function ProjectSubassemblies({ projectId }: ProjectSubassembliesProps) {
  const { employee } = useAuth();
  const queryClient = useQueryClient();
  const listQuery = useQuery({ queryKey: ["subassemblies", projectId], queryFn: () => fetchProjectSubassemblies(projectId) });
  const [newNumber, setNewNumber] = useState("");
  const [partsListForId, setPartsListForId] = useState<string | null>(null);
  const [hours, setHours] = useState<Record<string, string>>(emptyHours);
  const [error, setError] = useState<string | null>(null);
  const remainingQuery = useQuery({
    queryKey: ["subassemblies", projectId, "remaining-hours", partsListForId],
    queryFn: () => fetchRemainingHoursByCategory(projectId, partsListForId!),
    enabled: !!partsListForId,
  });
  const remaining = remainingQuery.data?.remainingHoursByCategory ?? null;

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
      setHours(emptyHours());
      invalidate();
    },
    onError: onMutationError,
  });
  const assemblyMutation = useMutation({ mutationFn: declareAssemblyReady, onSuccess: invalidate, onError: onMutationError });

  if (!employee) return null;
  const canDeclare = canDeclareSubassembly(employee.persona);
  const canPrepare = canPrepareSubassemblyPartsList(employee.persona);
  const canAssembly = canDeclareAssemblyReady(employee.persona);
  const subassemblies = listQuery.data?.subassemblies ?? [];

  function submitPartsList() {
    const hoursByCategory: Record<string, number> = {};
    for (const category of Object.keys(hours)) {
      const value = Number(hours[category]);
      if (value > 0) hoursByCategory[category] = value;
    }
    if (Object.keys(hoursByCategory).length === 0) {
      setError("Au moins une catégorie d'heures est requise.");
      return;
    }
    partsListMutation.mutate(hoursByCategory);
  }

  return (
    <div className="card" style={{ marginBottom: 20 }}>
      <h3 style={{ margin: 0, fontSize: 15 }}>Assemblages</h3>
      <p style={{ margin: "4px 0 10px", color: "var(--gsc-color-muted)", fontSize: 13 }}>
        Le Propriétaire (seul designer/conception) déclare un assemblage dès qu'il est vraiment prêt (numéro libre, sa propre logique
        d'ingénierie) — aucune description requise. Direction crée ensuite la liste de pièces (heures réelles) pour le rendre planifiable
        en production.
      </p>

      {error && <p className="form-error">{error}</p>}

      {canDeclare && (
        <form
          style={{ display: "flex", gap: 8, marginBottom: 14, flexWrap: "wrap" }}
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
      )}

      {subassemblies.length === 0 ? (
        <p style={{ color: "var(--gsc-color-muted)", fontSize: 13 }}>Aucun assemblage déclaré.</p>
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

              {sa.status === "pending_parts_list" && canPrepare && (
                <button
                  type="button"
                  className="btn btn-small"
                  style={{ marginTop: 10 }}
                  onClick={() => {
                    setError(null);
                    setHours(emptyHours());
                    setPartsListForId(sa.id);
                  }}
                >
                  Créer la liste de pièces
                </button>
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

      {partsListForId && (
        <div className="modal-backdrop" onClick={() => setPartsListForId(null)}>
          <div className="modal" style={{ maxWidth: 640 }} onClick={(event) => event.stopPropagation()}>
            <form
              onSubmit={(event) => {
                event.preventDefault();
                submitPartsList();
              }}
            >
              <div className="modal-header">
                <div>
                  <h2>Liste de pièces</h2>
                  <p className="modal-subtitle">Heures réelles par catégorie — jamais un prix vendu ici.</p>
                </div>
                <button type="button" className="modal-close" aria-label="Fermer" onClick={() => setPartsListForId(null)}>
                  ×
                </button>
              </div>

              <div className="modal-body">
                {error && <p className="form-error">{error}</p>}
                <div className="form-grid">
                  {FABRICATION_SUBCATEGORIES.map((category) => (
                    <div className="field" key={category.value}>
                      <label htmlFor={`pl-hours-${category.value}`}>{category.label}</label>
                      <input
                        id={`pl-hours-${category.value}`}
                        type="number"
                        min={0}
                        step="0.1"
                        value={hours[category.value]}
                        onFocus={(e) => e.target.select()}
                        onChange={(e) => setHours((current) => ({ ...current, [category.value]: e.target.value }))}
                      />
                      {remaining && remaining[category.value] !== undefined && (
                        <span className="cell-sub">Reste planifié : {remaining[category.value]} h</span>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              <div className="modal-footer">
                <button type="button" className="btn btn-secondary" onClick={() => setPartsListForId(null)}>
                  Annuler
                </button>
                <button type="submit" className="btn" disabled={partsListMutation.isPending}>
                  {partsListMutation.isPending ? "…" : "Confirmer la liste de pièces"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
