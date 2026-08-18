import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { canDeleteBudget, canResetBudget } from "@gsc-pilot/business-rules";
import { useAuth } from "../../lib/auth/useAuth.js";
import { ApiError } from "../../lib/apiClient.js";
import { OptionsDrawer, OptionRow, OptionSection } from "../../components/OptionsDrawer.js";
import { deleteBudget, resetBudgetContent, type BudgetDetail } from "./api.js";

interface BudgetOptionsMenuProps {
  budget: BudgetDetail;
  open: boolean;
  onClose: () => void;
  onDeleted: () => void;
}

/**
 * Menu Options du budgétaire (18 août 2026) — la vue n'offrait aucune
 * option (confirmé par l'utilisatrice). Même tiroir partagé que Projet et
 * Demandes clients. "Exporter en PDF" ouvre la vue d'impression dédiée
 * (BudgetExportView.tsx) dans un nouvel onglet — un seul format simple
 * pour l'instant, pas le futur système de modèles PDF configurables
 * (Paramètres, référencé dans la spec, hors de cette passe).
 */
export function BudgetOptionsMenu({ budget, open, onClose, onDeleted }: BudgetOptionsMenuProps) {
  const { employee } = useAuth();
  const queryClient = useQueryClient();
  const [confirmReset, setConfirmReset] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const invalidate = () => {
    setError(null);
    void queryClient.invalidateQueries({ queryKey: ["budget", budget.id] });
    void queryClient.invalidateQueries({ queryKey: ["budgets"] });
  };
  const onMutationError = (err: unknown) => setError(err instanceof ApiError ? err.message : "Une erreur est survenue — réessayez.");

  const resetMutation = useMutation({
    mutationFn: () => resetBudgetContent(budget.id),
    onSuccess: () => {
      setConfirmReset(false);
      invalidate();
    },
    onError: onMutationError,
  });
  const deleteMutation = useMutation({
    mutationFn: () => deleteBudget(budget.id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["client-requests"] });
      invalidate();
      onDeleted();
    },
    onError: onMutationError,
  });

  if (!open || !employee) return null;
  const canReset = canResetBudget(employee.persona);
  const canDelete = canDeleteBudget(employee.persona);

  return (
    <OptionsDrawer eyebrow="Options du budgétaire" title={`${budget.displayId} — ${budget.company ?? budget.contactName}`} onClose={onClose}>
      {error && <p className="form-error">{error}</p>}

      <OptionSection title="Documents">
        <OptionRow
          icon="📄"
          label="Exporter en PDF"
          onClick={() => {
            window.open(`/budgetaire/${budget.id}/export`, "_blank", "noopener");
            onClose();
          }}
        />
      </OptionSection>

      {(canReset || canDelete) && (
        <div style={{ marginTop: 18, paddingTop: 14, borderTop: "1px solid var(--gsc-color-line)" }}>
          <p style={{ margin: "0 0 10px", fontSize: 12, textTransform: "uppercase", letterSpacing: 0.04, color: "var(--gsc-color-muted)" }}>
            Actions sensibles
          </p>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
            {canReset &&
              (!confirmReset ? (
                <button type="button" className="btn btn-secondary btn-small" onClick={() => setConfirmReset(true)}>
                  Réinitialiser le contenu
                </button>
              ) : (
                <>
                  <span style={{ fontSize: 13 }}>Effacer toutes les valeurs saisies — recommencer à neuf ?</span>
                  <button type="button" className="btn btn-small" disabled={resetMutation.isPending} onClick={() => resetMutation.mutate()}>
                    {resetMutation.isPending ? "…" : "Confirmer la réinitialisation"}
                  </button>
                  <button type="button" className="btn btn-secondary btn-small" onClick={() => setConfirmReset(false)}>
                    Annuler
                  </button>
                </>
              ))}
            {canDelete &&
              (!confirmDelete ? (
                <button type="button" className="btn btn-secondary btn-small" onClick={() => setConfirmDelete(true)}>
                  Supprimer le budgétaire
                </button>
              ) : (
                <>
                  <span style={{ fontSize: 13 }}>Envoyer à la corbeille — confirmer ?</span>
                  <button type="button" className="btn btn-small" disabled={deleteMutation.isPending} onClick={() => deleteMutation.mutate()}>
                    {deleteMutation.isPending ? "…" : "Confirmer la suppression"}
                  </button>
                  <button type="button" className="btn btn-secondary btn-small" onClick={() => setConfirmDelete(false)}>
                    Annuler
                  </button>
                </>
              ))}
          </div>
        </div>
      )}
    </OptionsDrawer>
  );
}
