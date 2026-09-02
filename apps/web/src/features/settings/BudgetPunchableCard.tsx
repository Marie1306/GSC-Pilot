import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { fetchBudgetModelRate, updateBudgetModelRate } from "./api.js";
import { PunchableTasksSection } from "./PunchableTasksSection.js";
import "./settings.css";

/**
 * Catégorie fusionnée (26 août 2026, confirmé avec l'utilisatrice) : les
 * tâches punchables par catégorie ET le taux par défaut du back-up d'heures
 * (avant : deux réglages séparés, le second logé dans BillingSplitCard)
 * vivent maintenant dans une seule fenêtre contextuelle — tout ce qui
 * alimente le punch, le budgétaire, les vues Projet (Comparatif) et le
 * Post-mortem. Vérifié le même jour : Comparatif/Post-mortem/Rapports lisent
 * déjà dynamiquement les vraies tâches en base (aucune liste figée), donc
 * une tâche ajoutée ici apparaît automatiquement partout où elle doit — une
 * VRAIE nouvelle catégorie (pas juste une tâche) reste hors de portée d'ici
 * (enum Prisma + catalogues codés en dur, voir categories.ts), volontairement
 * laissée de côté pour l'instant. Le Cycle de facturation par défaut des
 * projets (les %, BillingSplitCard) reste sa propre carte, intacte — aucun
 * lien avec le punch/budgétaire, seulement avec la facturation.
 */
export function BudgetPunchableCard() {
  const [showManage, setShowManage] = useState(false);
  const queryClient = useQueryClient();
  const rateQuery = useQuery({ queryKey: ["budget-model-rate"], queryFn: fetchBudgetModelRate });
  const [rateDraftOverride, setRateDraftOverride] = useState<string | null>(null);

  const rateMutation = useMutation({
    mutationFn: (rate: number) => updateBudgetModelRate(rate),
    onSuccess: (result) => {
      setRateDraftOverride(String(result.backupHourlyRate));
      void queryClient.invalidateQueries({ queryKey: ["budget-model-rate"] });
    },
  });

  const rateDraft = rateDraftOverride ?? (rateQuery.data ? String(rateQuery.data.backupHourlyRate) : null);

  return (
    <div className="card" style={{ marginTop: 20 }}>
      <div className="card-band-header">
        <div>
          <h3>Budgétaire et tâches punchables</h3>
          <p className="modal-subtitle">
            Catégories, tâches, taux horaires et taux de back-up par défaut — alimente le punch, le budgétaire, les vues Projet et le
            Post-mortem.
          </p>
        </div>
        <button type="button" className="btn" onClick={() => setShowManage(true)}>
          Gérer
        </button>
      </div>

      {showManage && (
        <div className="modal-backdrop">
          <div className="modal" style={{ maxWidth: 760 }} onClick={(event) => event.stopPropagation()}>
            <div className="modal-header">
              <div>
                <h2>Budgétaire et tâches punchables</h2>
                <p className="modal-subtitle">Toutes les catégories et tâches punchables, plus le taux de back-up par défaut.</p>
              </div>
              <button type="button" className="modal-close" aria-label="Fermer" onClick={() => setShowManage(false)}>
                ×
              </button>
            </div>
            <div className="modal-body">
              <h3 style={{ fontSize: 14, marginTop: 0, marginBottom: 6 }}>Taux par défaut du back-up d'heures — nouveaux Budgétaires</h3>
              <p style={{ color: "var(--gsc-color-muted)", fontSize: 13, marginTop: -4 }}>
                Copié dans chaque nouveau Budgétaire à sa création. Les Budgétaires et projets déjà existants ne sont jamais recalculés.
              </p>
              {rateDraft !== null && (
                <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 20 }}>
                  <input
                    type="number"
                    min={0}
                    step="0.01"
                    style={{ maxWidth: 130 }}
                    value={rateDraft}
                    onChange={(event) => setRateDraftOverride(event.target.value)}
                  />
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
              )}

              <PunchableTasksSection />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
