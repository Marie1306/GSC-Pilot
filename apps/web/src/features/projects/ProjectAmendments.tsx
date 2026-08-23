import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { canCreateAmendment } from "@gsc-pilot/business-rules";
import { useAuth } from "../../lib/auth/useAuth.js";
import { ApiError } from "../../lib/apiClient.js";
import { formatCurrency } from "./api.js";
import { fetchProjectAmendments, createAmendment } from "../amendments/api.js";

interface ProjectAmendmentsProps {
  projectId: string;
  /** Marge visée du projet (gelée à la conversion budgétaire → projet, absente pour un projet créé directement) — sert de marge par défaut ici plutôt qu'une valeur arbitraire (rapport de l'utilisatrice, 23 août 2026). */
  targetMarginPct?: number | null;
}

const AVENANT_CATEGORIES = [
  { value: "conception", label: "Conception" },
  { value: "fabrication-plasma", label: "Fabrication — Plasma" },
  { value: "fabrication-pliage", label: "Fabrication — Pliage" },
  { value: "fabrication-usinage", label: "Fabrication — Usinage" },
  { value: "fabrication-soudage", label: "Fabrication — Soudage" },
  { value: "fabrication-peinture", label: "Fabrication — Peinture" },
  { value: "programmation", label: "Programmation" },
  { value: "assemblage", label: "Assemblage" },
  { value: "installation", label: "Installation" },
];
const CATEGORY_LABEL = new Map(AVENANT_CATEGORIES.map((c) => [c.value, c.label]));

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("fr-CA", { year: "numeric", month: "short", day: "numeric" });
}

interface HoursRow {
  category: string;
  hours: string;
}
const emptyRow = (): HoursRow => ({ category: AVENANT_CATEGORIES[0]!.value, hours: "" });
function emptyForm(targetMarginPct: number | null | undefined) {
  return { marginPct: targetMarginPct != null ? String(targetMarginPct) : "20", backupPct: "10", purchases: "" };
}

/**
 * Avenants (21 août 2026) — réutilise amendments.ts tel quel côté serveur.
 * Création verrouillée à Direction seulement (spec confirmée). S'additionne
 * au projet (jamais un remplacement) et génère automatiquement une demande
 * de facturation extra, déjà visible dans le Cycle de facturation ci-dessous
 * (ProjectInvoicePlan.tsx, même mécanisme que les jalons standards).
 */
export function ProjectAmendments({ projectId, targetMarginPct }: ProjectAmendmentsProps) {
  const { employee } = useAuth();
  const queryClient = useQueryClient();
  const listQuery = useQuery({ queryKey: ["amendments", projectId], queryFn: () => fetchProjectAmendments(projectId) });
  const [showForm, setShowForm] = useState(false);
  const [rows, setRows] = useState<HoursRow[]>([emptyRow()]);
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

  const createMutation = useMutation({
    mutationFn: () => {
      const hoursByCategory: Record<string, number> = {};
      for (const row of rows) {
        const hours = Number(row.hours);
        if (row.category && hours > 0) hoursByCategory[row.category] = hours;
      }
      return createAmendment(projectId, {
        hoursByCategory,
        marginPct: Number(form.marginPct),
        backupPct: Number(form.backupPct),
        purchases: form.purchases.trim() ? Number(form.purchases) : undefined,
      });
    },
    onSuccess: () => {
      setShowForm(false);
      setRows([emptyRow()]);
      setForm(emptyForm(targetMarginPct));
      invalidate();
    },
    onError: onMutationError,
  });

  if (!employee) return null;
  const canCreate = canCreateAmendment(employee.persona);
  const amendments = listQuery.data?.amendments ?? [];
  const hasAnyHours = rows.some((row) => row.category && Number(row.hours) > 0);
  const canSubmit = hasAnyHours && Number(form.marginPct) >= 0 && Number(form.backupPct) >= 0 && !createMutation.isPending;

  return (
    <div className="card" style={{ marginBottom: 20 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <h3 style={{ margin: 0, fontSize: 15 }}>Avenants</h3>
        {canCreate && !showForm && (
          <button type="button" className="btn btn-small" onClick={() => setShowForm(true)}>
            + Créer un avenant
          </button>
        )}
      </div>
      <p style={{ margin: "4px 0 10px", color: "var(--gsc-color-muted)", fontSize: 13 }}>
        Un avenant s'additionne au projet (heures, coût, prix vendu) — le budgétaire original reste intact. Génère automatiquement une
        demande de facturation extra (voir Cycle de facturation ci-dessous).
      </p>

      {error && <p className="form-error">{error}</p>}

      {showForm && (
        <div className="card" style={{ marginBottom: 14, background: "var(--gsc-color-surface2)", border: "none" }}>
          {rows.map((row, index) => (
            <div key={index} style={{ display: "flex", gap: 8, marginBottom: 6 }}>
              <select
                value={row.category}
                onChange={(e) => setRows(rows.map((r, i) => (i === index ? { ...r, category: e.target.value } : r)))}
                style={{ flex: 1 }}
              >
                {AVENANT_CATEGORIES.map((c) => (
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
              <button type="button" className="icon-btn" title="Retirer" onClick={() => setRows(rows.filter((_, i) => i !== index))} disabled={rows.length === 1}>
                ×
              </button>
            </div>
          ))}
          <button type="button" className="btn btn-secondary btn-small" style={{ marginBottom: 12 }} onClick={() => setRows([...rows, emptyRow()])}>
            + Catégorie
          </button>

          <div className="form-grid">
            <div className="field">
              <label>Marge (%)</label>
              <input type="number" min={0} max={99.99} step="0.1" value={form.marginPct} onChange={(e) => setForm({ ...form, marginPct: e.target.value })} />
            </div>
            <div className="field">
              <label>Back-up (%)</label>
              <input type="number" min={0} step="0.1" value={form.backupPct} onChange={(e) => setForm({ ...form, backupPct: e.target.value })} />
            </div>
            <div className="field">
              <label>Achats (facultatif)</label>
              <input type="number" min={0} step="0.01" value={form.purchases} onChange={(e) => setForm({ ...form, purchases: e.target.value })} />
            </div>
          </div>

          <div style={{ display: "flex", gap: 8 }}>
            <button type="button" className="btn btn-small" disabled={!canSubmit} onClick={() => createMutation.mutate()}>
              {createMutation.isPending ? "…" : "Créer l'avenant"}
            </button>
            <button type="button" className="btn btn-secondary btn-small" onClick={() => setShowForm(false)}>
              Annuler
            </button>
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
