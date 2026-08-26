import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { fetchBillingSplit, updateBillingSplit, type BillingSplitStep } from "./api.js";
import "./settings.css";

/**
 * Cycle de facturation par défaut (Settings.defaultBillingSplit) — lu par
 * computeBillingPlan à la conversion d'un budgétaire en projet (voir
 * projects/service.ts) et à l'ajout d'un sold sur un projet direct. Écart
 * corrigé le 20 août 2026 : ce champ existait depuis la Phase 1 mais
 * n'était jamais lu — toujours DEFAULT_BILLING_SPLIT codé en dur.
 *
 * Le taux par défaut du back-up vivait ici jusqu'au 26 août 2026 — déplacé
 * dans la nouvelle catégorie fusionnée « Budgétaire et tâches punchables »
 * (BudgetPunchableCard) à la demande de l'utilisatrice, ce réglage n'ayant
 * aucun lien avec le cycle de facturation lui-même. Cette carte ne garde
 * plus que les % du cycle.
 */
export function BillingSplitCard() {
  const queryClient = useQueryClient();
  const splitQuery = useQuery({ queryKey: ["billing-split"], queryFn: fetchBillingSplit });

  const [stepsOverride, setStepsOverride] = useState<BillingSplitStep[] | null>(null);
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

  const steps = stepsOverride ?? (splitQuery.data ? splitQuery.data.steps : null);
  const setSteps = setStepsOverride;

  if (!steps) return null;

  const total = steps.reduce((sum, step) => sum + Number(step.pct || 0), 0);

  return (
    <div className="card" style={{ marginTop: 20 }}>
      <div className="card-band-header">
        <div>
          <h3>Cycle de facturation par défaut des projets</h3>
          <p className="modal-subtitle">
            Le total doit être exactement égal à 100 %. Appliqué aux nouveaux projets seulement — un plan déjà généré n'est jamais
            retouché.
          </p>
        </div>
      </div>

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
    </div>
  );
}
