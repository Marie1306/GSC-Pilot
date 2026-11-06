import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { canApprovePurchaseRequest, buildFrozenPurchaseThresholdsMap } from "@gsc-pilot/business-rules";
import { useAuth } from "../../lib/auth/useAuth.js";
import { ApiError } from "../../lib/apiClient.js";
import { formatCalendarDate } from "../../lib/date.js";
import { OptionsDrawer } from "../../components/OptionsDrawer.js";
import {
  fetchPurchaseRequests,
  setPurchaseRequestAmount,
  approvePurchaseRequest,
  rejectPurchaseRequest,
  formatCurrency,
  STATUS_LABELS,
  FULFILLMENT_STATUS_LABELS,
  type PurchaseRequestDto,
} from "./api.js";

interface PurchaseRequestActionDrawerProps {
  id: string;
  onClose: () => void;
  /** Ligne déjà chargée par l'appelant (PurchaseRequestList.tsx, section Historique) — l'Historique n'est jamais dans listQuery ci-dessous (terminal, exclu de la requête active), donc introuvable sans ce filet. Ignoré dès que listQuery contient la ligne (toujours préférée, plus fraîche). */
  fallbackRow?: PurchaseRequestDto;
}

const PENDING_STATUSES = new Set(["owner_pending", "boss_pending"]);

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleDateString("fr-CA", { year: "numeric", month: "short", day: "numeric" });
}

/**
 * Détail + actions d'une demande d'achat, ouvert depuis le Centre d'actions
 * (25 août 2026) — sans page dédiée à un achat unique, réutilise la même
 * requête de liste que PurchaseRequestList (queryKey partagée, instantanée
 * si déjà chargée) et EXACTEMENT les mêmes mutations, jamais une deuxième
 * logique d'approbation en parallèle.
 *
 * Également ouvert directement depuis les 3 tableaux de PurchaseRequestList
 * (6 novembre 2026, demande explicite : impossible jusqu'ici de cliquer sur
 * une demande pour voir sa photo) — donc plus seulement des lignes en
 * attente. Le bloc Approuver/Rejeter/prix ne s'affiche que si la demande
 * est VRAIMENT en attente (isPending ci-dessous), jamais seulement sur la
 * permission canAct — une demande déjà autorisée ou rejetée montre à la
 * place un résumé de statut en lecture seule (sinon des boutons actifs
 * échoueraient simplement au clic, côté serveur, de façon confuse).
 */
export function PurchaseRequestActionDrawer({ id, onClose, fallbackRow }: PurchaseRequestActionDrawerProps) {
  const { employee } = useAuth();
  const queryClient = useQueryClient();
  const listQuery = useQuery({ queryKey: ["purchase-requests"], queryFn: fetchPurchaseRequests });
  const row = listQuery.data?.purchaseRequests.find((r) => r.id === id) ?? fallbackRow;
  const [amountDraft, setAmountDraft] = useState("");
  const [error, setError] = useState<string | null>(null);

  const invalidate = () => {
    setError(null);
    void queryClient.invalidateQueries({ queryKey: ["purchase-requests"] });
    void queryClient.invalidateQueries({ queryKey: ["purchase-requests-history"] });
    void queryClient.invalidateQueries({ queryKey: ["action-center"] });
    void queryClient.invalidateQueries({ queryKey: ["dashboard"] });
  };
  const onMutationError = (err: unknown) => setError(err instanceof ApiError ? err.message : "Une erreur est survenue — réessayez.");

  const amountMutation = useMutation({ mutationFn: (amount: number) => setPurchaseRequestAmount(id, amount), onSuccess: invalidate, onError: onMutationError });
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
        <p style={{ color: "var(--gsc-color-muted)", fontSize: 13 }}>{listQuery.isLoading ? "Chargement…" : "Cette demande est introuvable."}</p>
      </OptionsDrawer>
    );
  }

  const isPending = PENDING_STATUSES.has(row.status);
  const thresholds = buildFrozenPurchaseThresholdsMap({
    category: row.categoryName,
    thresholdAmountAtSubmission: row.thresholdAmountAtSubmission ?? null,
  });
  const canAct =
    isPending &&
    canApprovePurchaseRequest(
      {},
      employee.persona,
      { category: row.categoryName ?? undefined, amount: row.amount ?? 0, requesterPersona: row.requesterPersona },
      thresholds,
    );

  return (
    <OptionsDrawer eyebrow={isPending ? "Achat à approuver" : "Achat"} title={`${row.displayId} — ${row.description}`} onClose={onClose}>
      {error && <p className="form-error">{error}</p>}
      <p style={{ fontSize: 13, lineHeight: 1.7 }}>
        Catégorie : {row.categoryName ?? "— (liste rapide)"}
        <br />
        {row.externalSaleId ? "Vente" : "Projet"} : {row.projectLabel ?? row.externalSaleLabel ?? "—"}
        <br />
        Fournisseur(s) : {row.supplier ?? "—"}
        <br />
        Demandé par : {row.requesterName}
      </p>

      {row.photos.length > 0 && (
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
          {row.photos.map((photo) => (
            <img key={photo.id} src={photo.imageDataUrl} alt="" style={{ width: 96, height: 96, objectFit: "cover", borderRadius: 6 }} />
          ))}
        </div>
      )}

      {!isPending && (
        <p style={{ fontSize: 13, lineHeight: 1.7, color: "var(--gsc-color-muted)" }}>
          Statut : {STATUS_LABELS[row.status] ?? row.status}
          <br />
          Prix : {row.amount != null ? formatCurrency(row.amount) : "—"}
          {row.status === "authorized" && (
            <>
              <br />
              Suivi de commande : {FULFILLMENT_STATUS_LABELS[row.fulfillmentStatus ?? "waiting"]}
              {row.expectedReceiptDate && (
                <>
                  <br />
                  Réception visée : {formatCalendarDate(row.expectedReceiptDate)}
                </>
              )}
            </>
          )}
          {row.appliedToProjectAt && (
            <>
              <br />
              Appliquée au projet le {formatDateTime(row.appliedToProjectAt)}
            </>
          )}
        </p>
      )}

      {isPending && !canAct && (
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
