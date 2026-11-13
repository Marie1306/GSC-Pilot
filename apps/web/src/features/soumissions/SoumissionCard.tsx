import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { canManageSoumission } from "@gsc-pilot/business-rules";
import { useAuth } from "../../lib/auth/useAuth.js";
import { ApiError } from "../../lib/apiClient.js";
import type { BudgetDetail } from "../budgets/api.js";
import { fetchSoumissionsForBudget, sendSoumission, decideSoumission, deleteSoumission, formatCurrency, SOUMISSION_STATUS_LABELS } from "./api.js";
import { PrepareSoumissionModal } from "./PrepareSoumissionModal.js";

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("fr-CA", { year: "numeric", month: "short", day: "numeric" });
}

function mutationErrorMessage(...mutations: { isError: boolean; error: unknown }[]): string | null {
  const failed = mutations.find((m) => m.isError);
  if (!failed) return null;
  return failed.error instanceof ApiError ? failed.error.message : "Une erreur est survenue — réessayez.";
}

interface SoumissionCardProps {
  budget: BudgetDetail;
}

/**
 * Nouvelle section sur BudgetDetail.tsx (13 novembre 2026), visible une fois
 * le budgétaire « Prêt » ou plus avancé (jamais "draft"/"declined" — voir
 * la même garde côté serveur, createSoumission). N'automatise ni ne
 * remplace les gestes existants « Marquer prêt/envoyé/Contrat obtenu » ni
 * « Convertir en projet » — purement additif.
 */
export function SoumissionCard({ budget }: SoumissionCardProps) {
  const { employee } = useAuth();
  const queryClient = useQueryClient();
  const [showPrepare, setShowPrepare] = useState(false);

  const soumissionsQuery = useQuery({ queryKey: ["soumissions", budget.id], queryFn: () => fetchSoumissionsForBudget(budget.id) });
  const invalidate = () => void queryClient.invalidateQueries({ queryKey: ["soumissions", budget.id] });

  const sendMutation = useMutation({ mutationFn: sendSoumission, onSuccess: invalidate });
  const decideMutation = useMutation({
    mutationFn: ({ id, outcome }: { id: string; outcome: "accepted" | "declined" }) => decideSoumission(id, outcome),
    onSuccess: invalidate,
  });
  const deleteMutation = useMutation({ mutationFn: deleteSoumission, onSuccess: invalidate });

  if (!employee || !canManageSoumission(employee.persona)) return null;
  if (budget.status === "draft" || budget.status === "declined") return null;

  const soumissions = soumissionsQuery.data?.soumissions ?? [];
  const errorMessage = mutationErrorMessage(sendMutation, decideMutation, deleteMutation);

  return (
    <section className="card budget-section">
      <div className="budget-section-header">
        <h3>Soumission</h3>
        <button type="button" className="btn btn-small" onClick={() => setShowPrepare(true)}>
          Préparer la soumission
        </button>
      </div>

      {soumissions.length === 0 && <p style={{ color: "var(--gsc-color-muted)", fontSize: 13 }}>Aucune soumission préparée pour ce budgétaire.</p>}

      {soumissions.length > 0 && (
        <div className="table-scroll">
          <table className="shortlist-table">
            <thead>
              <tr>
                <th>Numéro</th>
                <th>Statut</th>
                <th className="num">Total</th>
                <th>Créée le</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {soumissions.map((soumission) => (
                <tr key={soumission.id}>
                  <td>{soumission.displayId}</td>
                  <td>{SOUMISSION_STATUS_LABELS[soumission.status]}</td>
                  <td className="num">{soumission.totalWithTax !== null ? formatCurrency(soumission.totalWithTax) : "—"}</td>
                  <td>{formatDate(soumission.createdAt)}</td>
                  <td style={{ display: "flex", gap: 6, justifyContent: "flex-end", flexWrap: "wrap" }}>
                    {soumission.status === "draft" && (
                      <button type="button" className="btn btn-small" disabled={sendMutation.isPending} onClick={() => sendMutation.mutate(soumission.id)}>
                        Envoyer
                      </button>
                    )}
                    {soumission.status === "sent" && (
                      <>
                        <button
                          type="button"
                          className="btn btn-small"
                          disabled={decideMutation.isPending}
                          onClick={() => decideMutation.mutate({ id: soumission.id, outcome: "accepted" })}
                        >
                          Marquer acceptée
                        </button>
                        <button
                          type="button"
                          className="btn btn-secondary btn-small"
                          disabled={decideMutation.isPending}
                          onClick={() => decideMutation.mutate({ id: soumission.id, outcome: "declined" })}
                        >
                          Marquer refusée
                        </button>
                      </>
                    )}
                    {soumission.sentAt && (
                      <button
                        type="button"
                        className="btn btn-secondary btn-small"
                        onClick={() => window.open(`/soumissions/${soumission.id}/export`, "_blank", "noopener")}
                      >
                        Imprimer
                      </button>
                    )}
                    <button
                      type="button"
                      className="btn btn-secondary btn-small"
                      onClick={() => {
                        if (window.confirm(`Supprimer la soumission ${soumission.displayId} ?`)) deleteMutation.mutate(soumission.id);
                      }}
                    >
                      🗑
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {errorMessage && <p className="form-error" style={{ marginTop: 8 }}>{errorMessage}</p>}

      {showPrepare && <PrepareSoumissionModal budget={budget} onClose={() => setShowPrepare(false)} />}
    </section>
  );
}
