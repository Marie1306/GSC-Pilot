import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { canApprovePurchaseRequest, canManagePurchaseFulfillment, buildFrozenPurchaseThresholdsMap } from "@gsc-pilot/business-rules";
import { useAuth } from "../../lib/auth/useAuth.js";
import { ApiError } from "../../lib/apiClient.js";
import {
  fetchPurchaseRequests,
  fetchPurchaseRequestHistory,
  fetchProjects,
  setPurchaseRequestAmount,
  setPurchaseRequestExpectedReceiptDate,
  approvePurchaseRequest,
  rejectPurchaseRequest,
  updatePurchaseRequest,
  setFulfillmentStatus,
  applyPurchaseRequestToProject,
  formatCurrency,
  STATUS_LABELS,
  FULFILLMENT_STATUS_LABELS,
  type PurchaseRequestDto,
  type FulfillmentStatus,
} from "./api.js";

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("fr-CA", { year: "numeric", month: "short", day: "numeric" });
}

function formatRange(row: PurchaseRequestDto): string {
  if (row.amount !== undefined && row.amount !== null) return formatCurrency(row.amount);
  if (row.estimatedAmountMin != null || row.estimatedAmountMax != null) {
    const min = row.estimatedAmountMin != null ? row.estimatedAmountMin.toFixed(2) : "?";
    const max = row.estimatedAmountMax != null ? row.estimatedAmountMax.toFixed(2) : "?";
    return `≈ ${min}–${max} $`;
  }
  return "—";
}

/**
 * Centre d'action des demandes d'achat — étendu le 13 août 2026 : trois
 * sections (en attente / autorisées-suivi / historique), modification par
 * le demandeur de sa propre ligne tant qu'elle est en attente, suivi de
 * commande + application au projet pour les lignes autorisées.
 *
 * canAct est recalculé PAR LIGNE avec les vraies données gelées de chaque
 * demande (canApprovePurchaseRequest, roles.ts, jamais une approximation
 * séparée) — nécessaire depuis que le formulaire général introduit de
 * vraies catégories/seuils (avant, la liste rapide seule ne déclenchait
 * jamais de seuil, une approximation simple suffisait).
 */
export function PurchaseRequestList() {
  const { employee } = useAuth();
  const queryClient = useQueryClient();
  const listQuery = useQuery({ queryKey: ["purchase-requests"], queryFn: fetchPurchaseRequests });
  const [draftAmounts, setDraftAmounts] = useState<Record<string, string>>({});
  const [draftReceiptDates, setDraftReceiptDates] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);

  // Historique — requête séparée et bornée (voir api.ts), jamais dérivée de
  // listQuery ci-dessus : c'est justement ce qui grossissait sans fin avant
  // le 28 août 2026 (rapport de l'utilisatrice). Filtres appliqués côté
  // serveur, pas un simple masquage client.
  const [historyDateFrom, setHistoryDateFrom] = useState("");
  const [historyDateTo, setHistoryDateTo] = useState("");
  const [historyProjectId, setHistoryProjectId] = useState("");
  const historyFilter = {
    dateFrom: historyDateFrom || undefined,
    dateTo: historyDateTo || undefined,
    projectId: historyProjectId || undefined,
  };
  const historyQuery = useQuery({
    queryKey: ["purchase-requests-history", historyFilter],
    queryFn: () => fetchPurchaseRequestHistory(historyFilter),
  });
  const projectsQuery = useQuery({ queryKey: ["projects", "options"], queryFn: fetchProjects });

  const invalidate = () => {
    setError(null);
    void queryClient.invalidateQueries({ queryKey: ["purchase-requests"] });
    void queryClient.invalidateQueries({ queryKey: ["purchase-requests-history"] });
  };
  const onMutationError = (err: unknown) => setError(err instanceof ApiError ? err.message : "Une erreur est survenue — réessayez.");

  const amountMutation = useMutation({ mutationFn: ({ id, amount }: { id: string; amount: number }) => setPurchaseRequestAmount(id, amount), onSuccess: invalidate, onError: onMutationError });
  const receiptDateMutation = useMutation({
    mutationFn: ({ id, date }: { id: string; date: string }) => setPurchaseRequestExpectedReceiptDate(id, date),
    onSuccess: invalidate,
    onError: onMutationError,
  });
  const approveMutation = useMutation({ mutationFn: approvePurchaseRequest, onSuccess: invalidate, onError: onMutationError });
  const rejectMutation = useMutation({ mutationFn: (id: string) => rejectPurchaseRequest(id), onSuccess: invalidate, onError: onMutationError });
  const updateMutation = useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: Parameters<typeof updatePurchaseRequest>[1] }) => updatePurchaseRequest(id, patch),
    onSuccess: invalidate,
    onError: onMutationError,
  });
  const fulfillmentMutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: FulfillmentStatus }) => setFulfillmentStatus(id, status),
    onSuccess: invalidate,
    onError: onMutationError,
  });
  const applyMutation = useMutation({ mutationFn: applyPurchaseRequestToProject, onSuccess: invalidate, onError: onMutationError });

  if (!employee) return null;

  const rows = listQuery.data?.purchaseRequests ?? [];
  const pending = rows.filter((row) => row.status === "owner_pending" || row.status === "boss_pending");
  const inProgress = rows.filter((row) => row.status === "authorized" && !row.appliedToProjectAt);
  const history = historyQuery.data?.purchaseRequests ?? [];
  const projectOptions = projectsQuery.data?.projects ?? [];
  const historyFilterActive = Boolean(historyDateFrom || historyDateTo || historyProjectId);

  function canActOn(row: PurchaseRequestDto): boolean {
    const thresholds = buildFrozenPurchaseThresholdsMap({ category: row.categoryName, thresholdAmountAtSubmission: row.thresholdAmountAtSubmission ?? null });
    return canApprovePurchaseRequest({}, employee!.persona, { category: row.categoryName ?? undefined, amount: row.amount ?? 0, requesterPersona: row.requesterPersona }, thresholds);
  }
  const canManageFulfillment = canManagePurchaseFulfillment({}, employee.persona);

  return (
    <>
      {error && <p className="form-error">{error}</p>}

      <div className="card" style={{ marginTop: 20 }}>
        <div className="card-band-header">
          <h3>En attente d'approbation</h3>
        </div>
        {pending.length === 0 && <p style={{ color: "var(--gsc-color-muted)", fontSize: 13 }}>Aucune demande en attente pour l'instant.</p>}
        {pending.length > 0 && (
          <div className="table-scroll">
          <table className="shortlist-table">
            <thead>
              <tr>
                <th>#</th>
                <th>Catégorie</th>
                <th>Projet</th>
                <th>Description</th>
                <th>Fournisseur(s)</th>
                <th>Prix</th>
                <th>Proposé par</th>
                {(pending.some(canActOn) || pending.some((row) => row.requesterId === employee.id)) && <th>Actions</th>}
              </tr>
            </thead>
            <tbody>
              {pending.map((row) => {
                const isOwn = row.requesterId === employee.id;
                const canAct = canActOn(row);
                return (
                  <tr key={row.id}>
                    <td>{row.displayId}</td>
                    <td>{row.categoryName ?? "— (liste rapide)"}</td>
                    <td>{row.projectLabel ?? "—"}</td>
                    <td>
                      {isOwn ? (
                        <input
                          key={`desc-${row.id}-${row.description}`}
                          defaultValue={row.description}
                          onBlur={(e) => {
                            const value = e.target.value.trim();
                            if (value && value !== row.description) updateMutation.mutate({ id: row.id, patch: { description: value } });
                          }}
                        />
                      ) : (
                        row.description
                      )}
                      {row.editedAt && <div className="cell-sub">Modifiée le {formatDate(row.editedAt)}</div>}
                    </td>
                    <td>
                      {isOwn ? (
                        <input
                          key={`supplier-${row.id}-${row.supplier}`}
                          defaultValue={row.supplier ?? ""}
                          onBlur={(e) => {
                            const value = e.target.value.trim() || null;
                            if (value !== row.supplier) updateMutation.mutate({ id: row.id, patch: { supplier: value } });
                          }}
                        />
                      ) : (
                        (row.supplier ?? "—")
                      )}
                    </td>
                    <td>{formatRange(row)}</td>
                    <td>{row.requesterName}</td>
                    {(canAct || isOwn) && (
                      <td>
                        {canAct && (
                          <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "nowrap" }}>
                            <input
                              type="number"
                              min={0}
                              step="0.01"
                              placeholder="Prix final"
                              style={{ width: 90, flex: "none" }}
                              value={draftAmounts[row.id] ?? (row.amount ?? "")}
                              onFocus={(e) => e.target.select()}
                              onChange={(event) => setDraftAmounts((current) => ({ ...current, [row.id]: event.target.value }))}
                            />
                            <button
                              type="button"
                              className="btn btn-secondary"
                              style={{ flex: "none", whiteSpace: "nowrap" }}
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
                              style={{ flex: "none", whiteSpace: "nowrap" }}
                              disabled={row.amount == null}
                              onClick={() => approveMutation.mutate(row.id)}
                            >
                              Approuver
                            </button>
                            <button
                              type="button"
                              className="btn btn-secondary"
                              style={{ flex: "none", whiteSpace: "nowrap" }}
                              onClick={() => rejectMutation.mutate(row.id)}
                            >
                              Rejeter
                            </button>
                          </div>
                        )}
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
          </div>
        )}
      </div>

      {(inProgress.length > 0 || canManageFulfillment) && (
        <div className="card" style={{ marginTop: 20 }}>
          <div className="card-band-header">
            <h3>Autorisées — suivi de commande</h3>
          </div>
          {inProgress.length === 0 && <p style={{ color: "var(--gsc-color-muted)", fontSize: 13 }}>Aucune demande autorisée en attente d'application au projet.</p>}
          {inProgress.length > 0 && (
            <div className="table-scroll">
            <table className="shortlist-table">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Catégorie</th>
                  <th>Projet</th>
                  <th>Description</th>
                  <th>Prix</th>
                  <th>Réception visée</th>
                  <th>Suivi</th>
                  {canManageFulfillment && <th>Actions</th>}
                </tr>
              </thead>
              <tbody>
                {inProgress.map((row) => (
                  <tr key={row.id}>
                    <td>{row.displayId}</td>
                    <td>{row.categoryName ?? "— (liste rapide)"}</td>
                    <td>{row.projectLabel ?? "—"}</td>
                    <td>{row.description}</td>
                    <td>{formatRange(row)}</td>
                    <td>{row.expectedReceiptDate ? formatDate(row.expectedReceiptDate) : "—"}</td>
                    <td>
                      {canManageFulfillment ? (
                        <select
                          value={row.fulfillmentStatus ?? "waiting"}
                          onChange={(e) => fulfillmentMutation.mutate({ id: row.id, status: e.target.value as FulfillmentStatus })}
                        >
                          {(Object.entries(FULFILLMENT_STATUS_LABELS) as [FulfillmentStatus, string][]).map(([value, label]) => (
                            <option key={value} value={value}>
                              {label}
                            </option>
                          ))}
                        </select>
                      ) : (
                        FULFILLMENT_STATUS_LABELS[row.fulfillmentStatus ?? "waiting"]
                      )}
                    </td>
                    {canManageFulfillment && (
                      <td style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "nowrap" }}>
                        <input
                          type="date"
                          style={{ width: 130, flex: "none" }}
                          value={draftReceiptDates[row.id] ?? (row.expectedReceiptDate ?? "")}
                          onChange={(event) => setDraftReceiptDates((current) => ({ ...current, [row.id]: event.target.value }))}
                        />
                        <button
                          type="button"
                          className="btn btn-secondary"
                          style={{ flex: "none", whiteSpace: "nowrap" }}
                          onClick={() => {
                            const value = draftReceiptDates[row.id];
                            if (value) receiptDateMutation.mutate({ id: row.id, date: value });
                          }}
                        >
                          Fixer la date
                        </button>
                        <button
                          type="button"
                          className="btn"
                          style={{ flex: "none", whiteSpace: "nowrap" }}
                          disabled={row.fulfillmentStatus !== "received" || applyMutation.isPending}
                          onClick={() => applyMutation.mutate(row.id)}
                        >
                          Appliquer au projet
                        </button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
            </div>
          )}
        </div>
      )}

      <div className="card" style={{ marginTop: 20 }}>
        <div className="card-band-header">
          <h3>Historique</h3>
        </div>

        <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "flex-end", padding: "14px 16px 0" }}>
          <div className="field" style={{ marginBottom: 0 }}>
            <label>Du</label>
            <input type="date" value={historyDateFrom} onChange={(e) => setHistoryDateFrom(e.target.value)} />
          </div>
          <div className="field" style={{ marginBottom: 0 }}>
            <label>Au</label>
            <input type="date" value={historyDateTo} onChange={(e) => setHistoryDateTo(e.target.value)} />
          </div>
          <div className="field" style={{ marginBottom: 0 }}>
            <label>Projet</label>
            <select value={historyProjectId} onChange={(e) => setHistoryProjectId(e.target.value)}>
              <option value="">Tous</option>
              {projectOptions.map((project) => (
                <option key={project.id} value={project.id}>
                  {project.projectNumber} — {project.name}
                </option>
              ))}
            </select>
          </div>
          {historyFilterActive && (
            <button
              type="button"
              className="btn btn-secondary btn-small"
              onClick={() => {
                setHistoryDateFrom("");
                setHistoryDateTo("");
                setHistoryProjectId("");
              }}
            >
              Réinitialiser
            </button>
          )}
        </div>

        {!historyFilterActive && (
          <p style={{ color: "var(--gsc-color-muted)", fontSize: 12, padding: "8px 16px 0" }}>
            Les 35 demandes les plus récentes — filtrez par date ou par projet pour voir plus loin.
          </p>
        )}

        {history.length === 0 && (
          <p style={{ color: "var(--gsc-color-muted)", fontSize: 13, padding: 16 }}>
            {historyQuery.isLoading ? "Chargement…" : "Aucune demande dans l'historique pour ce filtre."}
          </p>
        )}
        {history.length > 0 && (
          <div className="table-scroll" style={{ marginTop: 10 }}>
          <table className="shortlist-table">
            <thead>
              <tr>
                <th>#</th>
                <th>Catégorie</th>
                <th>Projet</th>
                <th>Description</th>
                <th>Prix</th>
                <th>Proposé par</th>
                <th>Statut</th>
              </tr>
            </thead>
            <tbody>
              {history.map((row) => (
                <tr key={row.id}>
                  <td>{row.displayId}</td>
                  <td>{row.categoryName ?? "— (liste rapide)"}</td>
                  <td>{row.projectLabel ?? "—"}</td>
                  <td>{row.description}</td>
                  <td>{formatRange(row)}</td>
                  <td>{row.requesterName}</td>
                  <td>{row.appliedToProjectAt ? `Appliquée au projet le ${formatDate(row.appliedToProjectAt)}` : (STATUS_LABELS[row.status] ?? row.status)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        )}
      </div>
    </>
  );
}
