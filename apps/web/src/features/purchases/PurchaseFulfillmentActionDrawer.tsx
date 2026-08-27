import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ApiError } from "../../lib/apiClient.js";
import { OptionsDrawer } from "../../components/OptionsDrawer.js";
import { fetchPurchaseRequests, setFulfillmentStatus, setPurchaseRequestExpectedReceiptDate, formatCurrency } from "./api.js";

interface PurchaseFulfillmentActionDrawerProps {
  id: string;
  onClose: () => void;
}

/**
 * Détail + suivi de commande d'un achat déjà autorisé, ouvert depuis le
 * Centre d'actions — catégorie "Commande à passer" (27 août 2026, rapport
 * de l'utilisatrice : le lien générique vers /achats n'amenait à rien de
 * concret, les demandes s'accumulaient sans façon de les faire disparaître
 * d'ici). Réutilise la même requête et les mêmes mutations que
 * PurchaseRequestList (queryKey partagée), jamais une deuxième logique de
 * suivi en parallèle. Action unique pertinente à ce stade : marquer la
 * commande passée (fulfillmentStatus "ordered", ce qui retire l'item de
 * cette catégorie) — "reçu"/"appliqué au projet" restent sur la page
 * Achats, étape suivante qui ne concerne plus cette catégorie.
 */
export function PurchaseFulfillmentActionDrawer({ id, onClose }: PurchaseFulfillmentActionDrawerProps) {
  const queryClient = useQueryClient();
  const listQuery = useQuery({ queryKey: ["purchase-requests"], queryFn: fetchPurchaseRequests });
  const row = listQuery.data?.purchaseRequests.find((r) => r.id === id);
  const [dateDraft, setDateDraft] = useState("");
  const [error, setError] = useState<string | null>(null);

  const invalidate = () => {
    setError(null);
    void queryClient.invalidateQueries({ queryKey: ["purchase-requests"] });
    void queryClient.invalidateQueries({ queryKey: ["action-center"] });
    void queryClient.invalidateQueries({ queryKey: ["dashboard"] });
  };
  const onMutationError = (err: unknown) => setError(err instanceof ApiError ? err.message : "Une erreur est survenue — réessayez.");

  const dateMutation = useMutation({
    mutationFn: (date: string) => setPurchaseRequestExpectedReceiptDate(id, date),
    onSuccess: invalidate,
    onError: onMutationError,
  });
  const orderedMutation = useMutation({
    mutationFn: () => setFulfillmentStatus(id, "ordered"),
    onSuccess: () => {
      invalidate();
      onClose();
    },
    onError: onMutationError,
  });

  if (!row) {
    return (
      <OptionsDrawer eyebrow="Commande à passer" title={listQuery.isLoading ? "Chargement…" : "Introuvable"} onClose={onClose}>
        <p style={{ color: "var(--gsc-color-muted)", fontSize: 13 }}>
          {listQuery.isLoading ? "Chargement…" : "Cette demande n'est plus en attente de commande."}
        </p>
      </OptionsDrawer>
    );
  }

  return (
    <OptionsDrawer eyebrow="Commande à passer" title={`${row.displayId} — ${row.description}`} onClose={onClose}>
      {error && <p className="form-error">{error}</p>}
      <p style={{ fontSize: 13, lineHeight: 1.7 }}>
        Catégorie : {row.categoryName ?? "— (liste rapide)"}
        <br />
        Projet : {row.projectLabel ?? "—"}
        <br />
        Fournisseur(s) : {row.supplier ?? "—"}
        <br />
        Prix : {row.amount != null ? formatCurrency(row.amount) : "—"}
        <br />
        Demandé par : {row.requesterName}
      </p>

      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
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
        <button type="button" className="btn" disabled={orderedMutation.isPending} onClick={() => orderedMutation.mutate()}>
          ✓ Marquer commandée
        </button>
      </div>
    </OptionsDrawer>
  );
}
