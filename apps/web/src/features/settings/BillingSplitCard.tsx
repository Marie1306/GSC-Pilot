import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { fetchBillingSplit, updateBillingSplit, fetchBudgetModelRate, updateBudgetModelRate, type BillingSplitStep } from "./api.js";
import "./settings.css";

/**
 * Cycle de facturation par défaut (Settings.defaultBillingSplit) — lu par
 * computeBillingPlan à la conversion d'un budgétaire en projet (voir
 * projects/service.ts) et à l'ajout d'un sold sur un projet direct. Écart
 * corrigé le 20 août 2026 : ce champ existait depuis la Phase 1 mais
 * n'était jamais lu — toujours DEFAULT_BILLING_SPLIT codé en dur.
 *
 * Taux par défaut du back-up (BudgetModel.backupHourlyRate) regroupé dans
 * la même carte (deux réglages courts) — copié dans chaque nouveau
 * Budgétaire à sa création, jamais recalculé sur les Budgétaires/projets
 * déjà existants.
 */
export function BillingSplitCard() {
  const queryClient = useQueryClient();
  const splitQuery = useQuery({ queryKey: ["billing-split"], queryFn: fetchBillingSplit });
  const rateQuery = useQuery({ queryKey: ["budget-model-rate"], queryFn: fetchBudgetModelRate });

  const [stepsOverride, setStepsOverride] = useState<BillingSplitStep[] | null>(null);
  const [rateDraftOverride, setRateDraftOverride] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const splitMutation = useMutation({
    mutationFn: (value: BillingSplitStep[]) => updateBillingSplit(value),
    onSuccess: (result) => {
      setStepsOverride(result.steps);
      setError(null);
      void queryClient.invalidateQueries({ queryKey: ["billing-split"] });
    },
    onError: (err) => setError(err instanceof Error ? err.message : "Erreur — le total doit égaler 100 %."),
  });
  const rateMutation = useMutation({
    mutationFn: (rate: number) => updateBudgetModelRate(rate),
    onSuccess: (result) => {
      setRateDraftOverride(String(result.backupHourlyRate));
      void queryClient.invalidateQueries({ queryKey: ["budget-model-rate"] });
    },
  });

  const steps = stepsOverride ?? (splitQuery.data ? splitQuery.data.steps : null);
  const rateDraft = rateDraftOverride ?? (rateQuery.data ? String(rateQuery.data.backupHourlyRate) : null);
  const setSteps = setStepsOverride;
  const setRateDraft = setRateDraftOverride;

  if (!steps || rateDraft === null) return null;

  const total = steps.reduce((sum, step) => sum + Number(step.pct || 0), 0);

  return (
    <div className="card" style={{ marginTop: 20 }}>
      <h2 style={{ marginTop: 0, fontSize: 16 }}>Cycle de facturation par défaut des projets</h2>
      <p style={{ color: "var(--gsc-color-muted)", fontSize: 13, marginTop: -8 }}>
        Le total doit être exactement égal à 100 %. Appliqué aux nouveaux projets seulement — un plan déjà généré n'est jamais retouché.
      </p>

      <div className="form-grid" style={{ marginTop: 12 }}>
        {steps.map((step, index) => (
          <div className="field" key={index}>
            <label>{step.label}</label>
            <input
              type="number"
              min={0}
              max={100}
              step="0.01"
              value={step.pct}
              onChange={(event) => {
                const next = [...steps];
                next[index] = { ...step, pct: Number(event.target.value) };
                setSteps(next);
              }}
            />
          </div>
        ))}
      </div>
      <p style={{ fontSize: 13, color: total === 100 ? "var(--gsc-color-muted)" : "var(--gsc-color-danger)" }}>Total : {total} %</p>
      <button type="button" className="btn" disabled={total !== 100 || splitMutation.isPending} onClick={() => splitMutation.mutate(steps)}>
        {splitMutation.isPending ? "Enregistrement…" : "Enregistrer le cycle"}
      </button>
      {error && <p className="error-text">{error}</p>}

      <h3 style={{ fontSize: 14, marginTop: 24 }}>Taux par défaut du back-up d'heures — nouveaux Budgétaires</h3>
      <p style={{ color: "var(--gsc-color-muted)", fontSize: 13, marginTop: -6 }}>
        Copié dans chaque nouveau Budgétaire à sa création. Les Budgétaires et projets déjà existants ne sont jamais recalculés.
      </p>
      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
        <input type="number" min={0} step="0.01" style={{ maxWidth: 130 }} value={rateDraft} onChange={(event) => setRateDraft(event.target.value)} />
        <span style={{ fontSize: 13, color: "var(--gsc-color-muted)" }}>$/h</span>
        <button
          type="button"
          className="btn btn-secondary"
          disabled={rateDraft.trim().length === 0 || Number(rateDraft) < 0 || rateMutation.isPending}
          onClick={() => rateMutation.mutate(Number(rateDraft))}
        >
          {rateMutation.isPending ? "…" : "Enregistrer le taux"}
        </button>
      </div>
    </div>
  );
}
