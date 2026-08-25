import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { canApprovePurchaseRequest, buildFrozenPurchaseThresholdsMap } from "@gsc-pilot/business-rules";
import { useAuth } from "../../lib/auth/useAuth.js";
import { ApiError } from "../../lib/apiClient.js";
import { OptionsDrawer } from "../../components/OptionsDrawer.js";
import {
  fetchPurchaseRequests,
  setPurchaseRequestAmount,
  setPurchaseRequestExpectedReceiptDate,
  approvePurchaseRequest,
  rejectPurchaseRequest,
} from "./api.js";

interface PurchaseRequestActionDrawerProps {
  id: string;
  onClose: () => void;
}

/**
 * Détail + actions d'une demande d'achat, ouvert depuis le Centre d'actions
 * (25 août 2026) — sans page dédiée à un achat unique, réutilise la même
 * requête de liste que PurchaseRequestList (queryKey partagée, instantanée
 * si déjà chargée) et EXACTEMENT les mêmes mutations, jamais une deuxième
 * logique d'approbation en parallèle.
 */
export function PurchaseRequestActionDrawer({ id, onClose }: PurchaseRequestActionDrawerProps) {
  const { employee } = useAuth();
  const queryClient = useQueryClient();
  const listQuery = useQuery({ queryKey: ["purchase-requests"], queryFn: fetchPurchaseRequests });
  const row = listQuery.data?.purchaseRequests.find((r) => r.id === id);
  const [amountDraft, setAmountDraft] = useState("");
  const [dateDraft, setDateDraft] = useState("");
  const [error, setError] = useState<string | null>(null);

  const invalidate = () => {
    setError(null);
    void queryClient.invalidateQueries({ queryKey: ["purchase-requests"] });
    void queryClient.invalidateQueries({ queryKey: ["action-center"] });
    void queryClient.invalidateQueries({ queryKey: ["dashboard"] });
  };
  const onMutationError = (err: unknown) => setError(err instanceof ApiError ? err.message : "Une erreur est survenue — réessayez.");

  const amountMutation = useMutation({ mutationFn: (amount: number) => setPurchaseRequestAmount(id, amount), onSuccess: invalidate, onError: onMutationError });
  const dateMutation = useMutation({
    mutationFn: (date: string) => setPurchaseRequestExpectedReceiptDate(id, date),
    onSuccess: invalidate,
    onError: onMutationError,
  });
  const approveMutation = useMutation({
    mutationFn: () => approvePurchaseRequest(id),
    onSuccess: () => {
      invalidate();
      onClose();
    },
    onError: onMutationError,
  });
  const rejectMutation = useMutation({
    mutationFn: () => rejectPurchaseRequest(id),
    onSuccess: () => {
      invalidate();
      onClose();
    },
    onError: onMutationError,
  });

  if (!employee) return null;

  if (!row) {
    return (
      <OptionsDrawer eyebrow="Achat" title={listQuery.isLoading ? "Chargement…" : "Introuvable"} onClose={onClose}>
        <p style={{ color: "var(--gsc-color-muted)", fontSize: 13 }}>
          {listQuery.isLoading ? "Chargement…" : "Cette demande n'est plus en attente d'approbation."}
        </p>
      </OptionsDrawer>
    );
  }

  const thresholds = buildFrozenPurchaseThresholdsMap({
    category: row.categoryName,
    thresholdAmountAtSubmission: row.thresholdAmountAtSubmission ?? null,
  });
  const canAct = canApprovePurchaseRequest(
    {},
    employee.persona,
    { category: row.categoryName ?? undefined, amount: row.amount ?? 0, requesterPersona: row.requesterPersona },
    thresholds,
  );

  return (
    <OptionsDrawer eyebrow="Achat à approuver" title={`${row.displayId} — ${row.description}`} onClose={onClose}>
      {error && <p className="form-error">{error}</p>}
      <p style={{ fontSize: 13, lineHeight: 1.7 }}>
        Catégorie : {row.categoryName ?? "— (liste rapide)"}
        <br />
        Projet : {row.projectLabel ?? "—"}
        <br />
        Fournisseur(s) : {row.supplier ?? "—"}
        <br />
        Demandé par : {row.requesterName}
        <br />
        Réception visée : {row.expectedReceiptDate ?? "—"}
      </p>

      {!canAct && (
        <p style={{ color: "var(--gsc-color-muted)", fontSize: 13 }}>Vous n'avez pas les droits pour agir sur cette demande.</p>
      )}

      {canAct && (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            <input
              type="number"
              min={0}
              step="0.01"
              placeholder="Prix final"
              value={amountDraft || (row.amount ?? "")}
              onFocus={(e) => e.target.select()}
              onChange={(event) => setAmountDraft(event.target.value)}
              style={{ width: 90, flex: "none" }}
            />
            <button
              type="button"
              className="btn btn-secondary btn-small"
              style={{ flex: "none" }}
              onClick={() => {
                const value = Number(amountDraft);
                if (value > 0) amountMutation.mutate(value);
              }}
            >
              Fixer
            </button>
          </div>
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            <input
              type="date"
              value={dateDraft || (row.expectedReceiptDate ?? "")}
              onChange={(event) => setDateDraft(event.target.value)}
              style={{ width: 140, flex: "none" }}
            />
            <button
              type="button"
              className="btn btn-secondary btn-small"
              style={{ flex: "none", whiteSpace: "nowrap" }}
              onClick={() => dateDraft && dateMutation.mutate(dateDraft)}
            >
              Fixer la date
            </button>
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button type="button" className="btn" disabled={row.amount == null || approveMutation.isPending} onClick={() => approveMutation.mutate()}>
              ✓ Approuver
            </button>
            <button type="button" className="btn" disabled={rejectMutation.isPending} onClick={() => rejectMutation.mutate()}>
              ✕ Rejeter
            </button>
          </div>
        </div>
      )}
    </OptionsDrawer>
  );
}
