import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { canDeleteBudget, canResetBudget, canModifyBudget } from "@gsc-pilot/business-rules";
import { useAuth } from "../../lib/auth/useAuth.js";
import { ApiError } from "../../lib/apiClient.js";
import { OptionsDrawer, OptionRow, OptionSection } from "../../components/OptionsDrawer.js";
import { deleteBudget, resetBudgetContent, addBudgetNote, type BudgetDetail } from "./api.js";

function formatNoteDate(iso: string): string {
  return new Date(iso).toLocaleDateString("fr-CA", { year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

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
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [confirmReset, setConfirmReset] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [noteDraft, setNoteDraft] = useState("");
  const [error, setError] = useState<string | null>(null);

  const invalidate = () => {
    setError(null);
    void queryClient.invalidateQueries({ queryKey: ["budget", budget.id] });
    void queryClient.invalidateQueries({ queryKey: ["budgets"] });
  };
  const onMutationError = (err: unknown) => setError(err instanceof ApiError ? err.message : "Une erreur est survenue — réessayez.");

  const noteMutation = useMutation({
    mutationFn: (body: string) => addBudgetNote(budget.id, body),
    onSuccess: () => {
      setNoteDraft("");
      invalidate();
    },
    onError: onMutationError,
  });

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
  const canAddNote = canModifyBudget(employee.persona);

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
        {budget.clientRequestId && (
          <OptionRow
            icon="📞"
            label="Demande originale"
            onClick={() => {
              onClose();
              navigate(`/demandes?open=${budget.clientRequestId}`);
            }}
          />
        )}
      </OptionSection>

      <div style={{ marginTop: 18, paddingTop: 14, borderTop: "1px solid var(--gsc-color-line)" }}>
        <p style={{ margin: "0 0 10px", fontSize: 12, textTransform: "uppercase", letterSpacing: 0.04, color: "var(--gsc-color-muted)" }}>
          Notes de suivi client
        </p>
        {budget.notes.length === 0 && <p style={{ fontSize: 13, color: "var(--gsc-color-muted)" }}>Aucune note pour l'instant.</p>}
        {budget.notes.length > 0 && (
          <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 12 }}>
            {budget.notes.map((note) => (
              <div key={note.id} style={{ fontSize: 13 }}>
                <div style={{ color: "var(--gsc-color-muted)", fontSize: 12 }}>
                  {formatNoteDate(note.createdAt)} — {note.authorName}
                </div>
                <div>{note.body}</div>
              </div>
            ))}
          </div>
        )}
        {canAddNote && (
          <div style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
            <textarea
              value={noteDraft}
              onChange={(event) => setNoteDraft(event.target.value)}
              placeholder="Ajouter une note…"
              rows={2}
              style={{ flex: 1, resize: "vertical" }}
            />
            <button
              type="button"
              className="btn btn-secondary btn-small"
              disabled={!noteDraft.trim() || noteMutation.isPending}
              onClick={() => noteMutation.mutate(noteDraft.trim())}
            >
              {noteMutation.isPending ? "…" : "Ajouter"}
            </button>
          </div>
        )}
      </div>

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
