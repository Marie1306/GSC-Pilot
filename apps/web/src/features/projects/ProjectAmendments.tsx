import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { canCreateAmendment, calculateAmendment, AMENDMENT_INTERNAL_RATES } from "@gsc-pilot/business-rules";
import { useAuth } from "../../lib/auth/useAuth.js";
import { ApiError } from "../../lib/apiClient.js";
import { formatCurrency } from "./api.js";
import { fetchProjectAmendments, createAmendment } from "../amendments/api.js";

interface ProjectAmendmentsProps {
  projectId: string;
  projectLabel: string;
  /** Marge visée du projet (gelée à la conversion budgétaire → projet, absente pour un projet créé directement) — sert de marge par défaut ici plutôt qu'une valeur arbitraire (rapport de l'utilisatrice, 23 août 2026). */
  targetMarginPct?: number | null;
  /** Taux gelé du budgétaire d'origine — même taux que calculateAmendment utilise côté serveur, réutilisé ici pour les totaux en direct. */
  backupHourlyRate?: number | null;
}

/** Mêmes 5 champs que la v19 (facilité de création, confirmée par l'utilisatrice le 23 août 2026) — la fabrication n'est PAS détaillée par sous-catégorie ici : la clé générique "fabrication" est déjà gérée par calculateAmendment/amendmentTasks exactement comme "fabrication-*" pour le calcul financier, seule la génération de tâches Gantt perd le détail plasma/pliage/usinage/soudage/peinture (jamais utilisé nulle part ailleurs pour un avenant). */
const AVENANT_CATEGORIES = [
  { value: "conception", label: "Conception" },
  { value: "fabrication", label: "Fabrication" },
  { value: "programmation", label: "Panneau et programmation" },
  { value: "assemblage", label: "Assemblage et test" },
  { value: "installation", label: "Installation" },
];

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("fr-CA", { year: "numeric", month: "short", day: "numeric" });
}

const CATEGORY_LABEL = new Map(AVENANT_CATEGORIES.map((c) => [c.value, c.label]));

function emptyHours(): Record<string, string> {
  return Object.fromEntries(AVENANT_CATEGORIES.map((c) => [c.value, "0"]));
}
function emptyForm(targetMarginPct: number | null | undefined) {
  return { marginPct: targetMarginPct != null ? String(targetMarginPct) : "20", backupPct: "10", purchases: "" };
}

/**
 * Avenants (21 août 2026, fenêtre contextuelle le 24 août 2026 — comparée à
 * la v19 par l'utilisatrice, préférée pour sa facilité de création : les
 * catégories déjà listées plutôt qu'ajoutées une par une, indices de coût
 * interne, totaux recalculés en direct). Réutilise amendments.ts tel quel
 * côté serveur ET côté client (calculateAmendment, AMENDMENT_INTERNAL_RATES
 * — fonctions/constantes pures, aucune dépendance serveur, donc le total
 * affiché ici EST le total qui sera enregistré, jamais une approximation
 * séparée qui pourrait diverger). Création verrouillée à Direction
 * seulement (spec confirmée). S'additionne au projet (jamais un
 * remplacement) et génère automatiquement une demande de facturation
 * extra, déjà visible dans le Cycle de facturation ci-dessous
 * (ProjectInvoicePlan.tsx, même mécanisme que les jalons standards).
 */
export function ProjectAmendments({ projectId, projectLabel, targetMarginPct, backupHourlyRate }: ProjectAmendmentsProps) {
  const { employee } = useAuth();
  const queryClient = useQueryClient();
  const listQuery = useQuery({ queryKey: ["amendments", projectId], queryFn: () => fetchProjectAmendments(projectId) });
  const [showForm, setShowForm] = useState(false);
  const [hours, setHours] = useState<Record<string, string>>(emptyHours);
  const [form, setForm] = useState(() => emptyForm(targetMarginPct));
  const [error, setError] = useState<string | null>(null);

  const invalidate = () => {
    setError(null);
    void queryClient.invalidateQueries({ queryKey: ["amendments", projectId] });
    void queryClient.invalidateQueries({ queryKey: ["project", projectId] });
    void queryClient.invalidateQueries({ queryKey: ["projects"] });
    void queryClient.invalidateQueries({ queryKey: ["invoice-plan", projectId] });
  };
  const onMutationError = (err: unknown) => setError(err instanceof ApiError ? err.message : "Une erreur est survenue — réessayez.");

  function buildHoursByCategory(): Record<string, number> {
    const result: Record<string, number> = {};
    for (const category of Object.keys(hours)) {
      const value = Number(hours[category]);
      if (value > 0) result[category] = value;
    }
    return result;
  }

  const createMutation = useMutation({
    mutationFn: () =>
      createAmendment(projectId, {
        hoursByCategory: buildHoursByCategory(),
        marginPct: Number(form.marginPct),
        backupPct: Number(form.backupPct),
        purchases: form.purchases.trim() ? Number(form.purchases) : undefined,
      }),
    onSuccess: () => {
      setShowForm(false);
      setHours(emptyHours());
      setForm(emptyForm(targetMarginPct));
      invalidate();
    },
    onError: onMutationError,
  });

  if (!employee) return null;
  const canCreate = canCreateAmendment(employee.persona);
  const amendments = listQuery.data?.amendments ?? [];
  const hoursByCategory = buildHoursByCategory();
  const hasAnyHours = Object.keys(hoursByCategory).length > 0;
  const canSubmit = hasAnyHours && Number(form.marginPct) >= 0 && Number(form.backupPct) >= 0 && !createMutation.isPending;

  // Même fonction pure que le serveur (calculateAmendment) — le total
  // affiché ici est garanti identique à ce que createAmendment calculera,
  // jamais une seconde formule qui pourrait diverger.
  const calc = calculateAmendment(hoursByCategory, {
    marginPct: Number(form.marginPct) || 0,
    backupPct: Number(form.backupPct) || 0,
    projectBackupRate: backupHourlyRate ?? 0,
    purchases: form.purchases.trim() ? Number(form.purchases) : 0,
  });

  return (
    <div className="card" style={{ marginBottom: 20 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <h3 style={{ margin: 0, fontSize: 15 }}>Avenants</h3>
        {canCreate && (
          <button type="button" className="btn btn-small" onClick={() => setShowForm(true)}>
            + Créer un avenant
          </button>
        )}
      </div>
      <p style={{ margin: "4px 0 10px", color: "var(--gsc-color-muted)", fontSize: 13 }}>
        Un avenant s'additionne au projet (heures, coût, prix vendu) — le budgétaire original reste intact. Génère automatiquement une
        demande de facturation extra (voir Cycle de facturation ci-dessous).
      </p>

      {showForm && (
        <div className="modal-backdrop" onClick={() => setShowForm(false)}>
          <div className="modal" style={{ maxWidth: 640 }} onClick={(event) => event.stopPropagation()}>
            <form
              onSubmit={(event) => {
                event.preventDefault();
                if (canSubmit) createMutation.mutate();
              }}
            >
              <div className="modal-header">
                <div>
                  <h2>Créer un avenant</h2>
                  <p className="modal-subtitle">{projectLabel}</p>
                </div>
                <button type="button" className="modal-close" aria-label="Fermer" onClick={() => setShowForm(false)}>
                  ×
                </button>
              </div>

              <div className="modal-body">
                {error && <p className="form-error">{error}</p>}
                <div className="form-grid">
                  {AVENANT_CATEGORIES.map((category) => (
                    <div className="field" key={category.value}>
                      <label htmlFor={`av-hours-${category.value}`}>{category.label}</label>
                      <input
                        id={`av-hours-${category.value}`}
                        type="number"
                        min={0}
                        step="0.1"
                        value={hours[category.value]}
                        onFocus={(e) => e.target.select()}
                        onChange={(e) => setHours((current) => ({ ...current, [category.value]: e.target.value }))}
                      />
                      <span className="cell-sub">
                        Coût interne : {formatCurrency(AMENDMENT_INTERNAL_RATES[category.value as keyof typeof AMENDMENT_INTERNAL_RATES])}/h
                      </span>
                    </div>
                  ))}
                </div>

                <div className="form-grid">
                  <div className="field">
                    <label htmlFor="av-margin">Marge cible (%)</label>
                    <input
                      id="av-margin"
                      type="number"
                      min={0}
                      max={99.99}
                      step="0.1"
                      value={form.marginPct}
                      onChange={(e) => setForm({ ...form, marginPct: e.target.value })}
                    />
                  </div>
                  <div className="field">
                    <label htmlFor="av-backup">Back-up (%)</label>
                    <input
                      id="av-backup"
                      type="number"
                      min={0}
                      step="0.1"
                      value={form.backupPct}
                      onChange={(e) => setForm({ ...form, backupPct: e.target.value })}
                    />
                  </div>
                  <div className="field field-full">
                    <label htmlFor="av-purchases">Achats avant taxes (facultatif)</label>
                    <input
                      id="av-purchases"
                      type="number"
                      min={0}
                      step="0.01"
                      value={form.purchases}
                      onChange={(e) => setForm({ ...form, purchases: e.target.value })}
                    />
                  </div>
                </div>

                <div className="stat-tile-grid">
                  <div className="stat-tile">
                    <span className="stat-tile-label">Coût main-d'œuvre</span>
                    <span className="stat-tile-value">{formatCurrency(calc.laborCost)}</span>
                  </div>
                  <div className="stat-tile">
                    <span className="stat-tile-label">Back-up</span>
                    <span className="stat-tile-value">
                      {calc.backupHours} h · {formatCurrency(calc.backupCost)}
                    </span>
                  </div>
                  <div className="stat-tile">
                    <span className="stat-tile-label">Achats</span>
                    <span className="stat-tile-value">{formatCurrency(calc.purchases)}</span>
                  </div>
                  <div className="stat-tile">
                    <span className="stat-tile-label">Coût interne total</span>
                    <span className="stat-tile-value">{formatCurrency(calc.totalCost)}</span>
                  </div>
                  <div className="stat-tile">
                    <span className="stat-tile-label">Prix vendu avenant</span>
                    <span className="stat-tile-value">{formatCurrency(calc.sale)}</span>
                  </div>
                  <div className="stat-tile">
                    <span className="stat-tile-label">Marge</span>
                    <span className="stat-tile-value">{calc.marginPct} %</span>
                  </div>
                </div>
              </div>

              <div className="modal-footer">
                <button type="button" className="btn btn-secondary" onClick={() => setShowForm(false)}>
                  Annuler
                </button>
                <button type="submit" className="btn" disabled={!canSubmit}>
                  {createMutation.isPending ? "…" : "Créer et appliquer l'avenant"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {amendments.length === 0 ? (
        <p style={{ color: "var(--gsc-color-muted)", fontSize: 13 }}>Aucun avenant.</p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {amendments.map((av) => (
            <div key={av.id} className="card" style={{ background: "var(--gsc-color-surface2)", border: "none" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
                <strong>{av.displayId}</strong>
                {av.sale !== undefined && <span className="badge-pill badge-neutral">{formatCurrency(av.sale)}</span>}
              </div>
              <div className="cell-sub">
                {av.createdByName} · {formatDate(av.createdAt)}
              </div>
              <div className="cell-sub" style={{ marginTop: 6 }}>
                {Object.entries(av.hoursByCategory)
                  .map(([cat, h]) => `${CATEGORY_LABEL.get(cat) ?? cat} : ${h} h`)
                  .join(" · ")}
              </div>
              {av.laborCost !== undefined && (
                <div className="cell-sub" style={{ marginTop: 6 }}>
                  Coût main-d'œuvre {formatCurrency(av.laborCost)} · Back-up {av.backupHours} h ({formatCurrency(av.backupCost ?? 0)})
                  {av.purchases ? ` · Achats ${formatCurrency(av.purchases)}` : ""}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
