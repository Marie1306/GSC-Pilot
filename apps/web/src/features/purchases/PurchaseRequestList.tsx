import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { canApprovePurchaseRequest } from "@gsc-pilot/business-rules";
import { useAuth } from "../../lib/auth/useAuth.js";
import { fetchPurchaseRequests, setPurchaseRequestAmount, approvePurchaseRequest, rejectPurchaseRequest, type PurchaseRequestDto } from "./api.js";

const STATUS_LABELS: Record<string, string> = {
  owner_pending: "En attente (Direction)",
  boss_pending: "En attente (Propriétaire)",
  authorized: "Autorisée",
  rejected: "Rejetée",
};

function formatRange(row: PurchaseRequestDto): string {
  if (row.amount !== undefined && row.amount !== null) return `${row.amount.toFixed(2)} $`;
  if (row.estimatedAmountMin != null || row.estimatedAmountMax != null) {
    const min = row.estimatedAmountMin != null ? row.estimatedAmountMin.toFixed(2) : "?";
    const max = row.estimatedAmountMax != null ? row.estimatedAmountMax.toFixed(2) : "?";
    return `≈ ${min}–${max} $`;
  }
  return "—";
}

export function PurchaseRequestList() {
  const { employee } = useAuth();
  const queryClient = useQueryClient();
  const listQuery = useQuery({ queryKey: ["purchase-requests"], queryFn: fetchPurchaseRequests });
  const [draftAmounts, setDraftAmounts] = useState<Record<string, string>>({});

  const invalidate = () => void queryClient.invalidateQueries({ queryKey: ["purchase-requests"] });
  const amountMutation = useMutation({
    mutationFn: ({ id, amount }: { id: string; amount: number }) => setPurchaseRequestAmount(id, amount),
    onSuccess: invalidate,
  });
  const approveMutation = useMutation({ mutationFn: approvePurchaseRequest, onSuccess: invalidate });
  const rejectMutation = useMutation({ mutationFn: (id: string) => rejectPurchaseRequest(id), onSuccess: invalidate });

  if (!employee) return null;
  // Aucune catégorie sur les lignes de la liste rapide → jamais de seuil → cette vérification simplifiée (sans
  // délégation active) correspond au cas courant. Le serveur reste la seule source d'autorité réelle dans tous les cas.
  const canAct = canApprovePurchaseRequest({}, employee.persona, { category: undefined, amount: 0 }, {});

  const rows = listQuery.data?.purchaseRequests ?? [];

  return (
    <div className="card" style={{ marginTop: 20 }}>
      <h2 style={{ marginTop: 0, fontSize: 16 }}>Demandes d'achat en attente</h2>
      {rows.length === 0 && <p style={{ color: "var(--gsc-color-muted)", fontSize: 13 }}>Aucune demande en attente pour l'instant.</p>}
      {rows.length > 0 && (
        <table className="shortlist-table">
          <thead>
            <tr>
              <th>#</th>
              <th>Projet</th>
              <th>Description</th>
              <th>Fournisseur(s)</th>
              <th>Prix</th>
              <th>Proposé par</th>
              <th>Statut</th>
              {canAct && <th>Actions</th>}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id}>
                <td>{row.displayId}</td>
                <td>{row.projectLabel ?? "—"}</td>
                <td>{row.description}</td>
                <td>{row.supplier ?? "—"}</td>
                <td>{formatRange(row)}</td>
                <td>{row.requesterName}</td>
                <td>{STATUS_LABELS[row.status] ?? row.status}</td>
                {canAct && (
                  <td>
                    {(row.status === "owner_pending" || row.status === "boss_pending") && (
                      <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                        <input
                          type="number"
                          min={0}
                          step="0.01"
                          placeholder="Prix final"
                          style={{ width: 90 }}
                          value={draftAmounts[row.id] ?? (row.amount ?? "")}
                          onChange={(event) => setDraftAmounts((current) => ({ ...current, [row.id]: event.target.value }))}
                        />
                        <button
                          type="button"
                          className="btn btn-secondary"
                          onClick={() => {
                            const value = Number(draftAmounts[row.id]);
                            if (value > 0) amountMutation.mutate({ id: row.id, amount: value });
                          }}
                        >
                          Fixer
                        </button>
                        <button
                          type="button"
                          className="btn"
                          disabled={row.amount == null}
                          onClick={() => approveMutation.mutate(row.id)}
                        >
                          Approuver
                        </button>
                        <button type="button" className="btn btn-secondary" onClick={() => rejectMutation.mutate(row.id)}>
                          Rejeter
                        </button>
                      </div>
                    )}
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
