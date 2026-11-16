import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { canReassignServiceCall, canPriceServiceParts, canApproveServiceCall, canSeeServicePricing } from "@gsc-pilot/business-rules";
import { useAuth } from "../../lib/auth/useAuth.js";
import { formatCalendarDate } from "../../lib/date.js";
import { useOnlineStatus } from "../../offline/useOnlineStatus.js";
import { enqueue } from "../../offline/sync.js";
import { OfflineBanner } from "../../offline/OfflineBanner.js";
import { fetchPunchableEmployees } from "../timePunch/api.js";
import { StartTaskModal } from "../timePunch/StartTaskModal.js";
import {
  fetchBonDeTravailDetail,
  updateBonDeTravail,
  addServiceCallPart,
  removeServiceCallPart,
  priceServiceCallPart,
  captureBonDeTravailSignature,
  approveBonDeTravail,
  type ServiceCallPartDto,
} from "./api.js";
import { SignatureModal } from "./SignatureModal.js";
import "./serviceCalls.css";

interface BonDeTravailDetailProps {
  id: string;
  onClose: () => void;
}

function formatDate(iso: string | null): string {
  return iso ? new Date(iso).toLocaleDateString("fr-CA", { year: "numeric", month: "long", day: "numeric" }) : "—";
}
function formatCurrency(value: number): string {
  return new Intl.NumberFormat("fr-CA", { style: "currency", currency: "CAD" }).format(value);
}
function formatHours(minutes: number | null): string {
  if (minutes === null) return "—";
  return `${Math.floor(minutes / 60)}h${String(minutes % 60).padStart(2, "0")}`;
}

interface PendingPart {
  id: string;
  name: string;
  qty: number;
}

/**
 * Bon de travail — un déplacement précis (Chantier D, 16 novembre 2026).
 * Reprend quasi verbatim les sections de l'ancien ServiceCallDetail.tsx
 * (avant la refonte, quand le Call de service agissait lui-même comme un
 * bon de travail), rescopées sur bonDeTravailId : repas en COMPTEUR
 * plutôt qu'en case à cocher (plusieurs techniciens sur un même BT
 * peuvent chacun réclamer un repas, confirmé par Marie). Jamais de prix
 * pour un technicien (canSeeServicePricing, inchangé).
 */
export function BonDeTravailDetail({ id, onClose }: BonDeTravailDetailProps) {
  const { employee } = useAuth();
  const queryClient = useQueryClient();
  const online = useOnlineStatus();
  const detailQuery = useQuery({ queryKey: ["bon-de-travail", id], queryFn: () => fetchBonDeTravailDetail(id) });
  const employeesQuery = useQuery({ queryKey: ["time-entries", "employees"], queryFn: fetchPunchableEmployees });
  const bt = detailQuery.data?.bonDeTravail;

  const [scheduledDraft, setScheduledDraft] = useState<string | null>(null);
  const [summaryDraft, setSummaryDraft] = useState<string | null>(null);
  const [kmDraft, setKmDraft] = useState<string | null>(null);
  const [newPartName, setNewPartName] = useState("");
  const [newPartQty, setNewPartQty] = useState("1");
  const [priceDrafts, setPriceDrafts] = useState<Record<string, string>>({});
  const [signing, setSigning] = useState(false);
  const [punching, setPunching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Terrain saisi hors ligne — même mécanisme que ServiceCallDetail avant la refonte.
  const [pendingParts, setPendingParts] = useState<PendingPart[]>([]);
  const [pendingSignature, setPendingSignature] = useState<{ dataUrl: string; signerName: string } | null>(null);

  useEffect(() => {
    function handleOnline() {
      setPendingParts([]);
      setPendingSignature(null);
      void queryClient.invalidateQueries({ queryKey: ["bon-de-travail", id] });
    }
    window.addEventListener("online", handleOnline);
    return () => window.removeEventListener("online", handleOnline);
  }, [id, queryClient]);

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ["bon-de-travail", id] });
    void queryClient.invalidateQueries({ queryKey: ["service-call"] });
    void queryClient.invalidateQueries({ queryKey: ["service-calls"] });
  };
  const onMutationError = (err: unknown) => setError(err instanceof Error ? err.message : "Erreur — réessayez.");

  const updateMutation = useMutation({
    mutationFn: (patch: Parameters<typeof updateBonDeTravail>[1]) =>
      online ? updateBonDeTravail(id, patch) : enqueue("bon-de-travail-update", { bonDeTravailId: id, patch }),
    onSuccess: invalidate,
    onError: onMutationError,
  });
  const addPartMutation = useMutation({
    mutationFn: async () => {
      const name = newPartName.trim();
      const qty = Number(newPartQty);
      if (online) return addServiceCallPart(id, { name, qty });
      setPendingParts((current) => [...current, { id: crypto.randomUUID(), name, qty }]);
      await enqueue("bon-de-travail-add-part", { bonDeTravailId: id, name, qty });
    },
    onSuccess: () => {
      setNewPartName("");
      setNewPartQty("1");
      invalidate();
    },
    onError: onMutationError,
  });
  const removePartMutation = useMutation({ mutationFn: removeServiceCallPart, onSuccess: invalidate, onError: onMutationError });
  const pricePartMutation = useMutation({
    mutationFn: ({ partId, costPerUnit }: { partId: string; costPerUnit: number }) => priceServiceCallPart(partId, { costPerUnit }),
    onSuccess: invalidate,
    onError: onMutationError,
  });
  const signatureMutation = useMutation({
    mutationFn: async ({ dataUrl, signerName }: { dataUrl: string; signerName: string }) => {
      if (online) return captureBonDeTravailSignature(id, dataUrl, signerName);
      setPendingSignature({ dataUrl, signerName });
      await enqueue("bon-de-travail-signature", { bonDeTravailId: id, dataUrl, signerName });
    },
    onSuccess: () => {
      setSigning(false);
      invalidate();
    },
    onError: onMutationError,
  });
  const approveMutation = useMutation({ mutationFn: () => approveBonDeTravail(id), onSuccess: invalidate, onError: onMutationError });

  if (!bt || !employee) {
    return (
      <div className="modal-backdrop">
        <div className="modal">
          <div className="modal-body">{detailQuery.isError ? "Bon de travail introuvable." : "Chargement…"}</div>
        </div>
      </div>
    );
  }

  const showFinancials = canSeeServicePricing(employee.persona);
  const canReassign = canReassignServiceCall(employee.persona);
  const canPrice = canPriceServiceParts(employee.persona);
  const canApprove = canApproveServiceCall(employee.persona);
  const employees = employeesQuery.data?.employees ?? [];
  const totalMinutes = bt.timeEntries.reduce((sum, entry) => sum + (entry.roundedMinutes ?? 0), 0);
  const pendingTimeEntryCount = bt.timeEntries.filter((entry) => entry.status !== "approved").length;
  // Un BT déjà facturé est figé (même principe qu'une facture envoyée partout ailleurs) — l'interface désactive les champs plutôt que de laisser l'utilisateur essayer et se faire refuser par le serveur.
  const locked = bt.invoicePlanEntryId !== null;

  const scheduled = scheduledDraft ?? (bt.scheduledAt ? bt.scheduledAt.slice(0, 10) : "");
  const summary = summaryDraft ?? bt.summary ?? "";
  const km = kmDraft ?? (bt.kmTraveled !== null ? String(bt.kmTraveled) : "");

  return (
    <div className="modal-backdrop">
      <div className="modal" style={{ maxWidth: 860 }}>
        <div className="modal-header">
          <div>
            <h2>{bt.displayId}</h2>
            <p className="modal-subtitle">
              {bt.serviceCallDisplayId} — {bt.serviceCallTitle} · {bt.company ?? bt.contactName}
            </p>
          </div>
          <button type="button" className="modal-close" onClick={onClose} aria-label="Fermer">
            ×
          </button>
        </div>

        <div className="modal-body">
          <OfflineBanner />
          {locked && (
            <p className="form-error" style={{ background: "transparent", color: "var(--gsc-color-muted)" }}>
              Ce Bon de travail est déjà facturé — figé, comme toute facture envoyée.
            </p>
          )}
          <div className="stat-tile-grid">
            <div className="stat-tile">
              <span className="stat-tile-label">Techniciens</span>
              <span className="stat-tile-value">{bt.assignedEmployees.length}</span>
            </div>
            <div className="stat-tile">
              <span className="stat-tile-label">Temps comptabilisé</span>
              <span className="stat-tile-value">{formatHours(totalMinutes)}</span>
            </div>
            <div className="stat-tile">
              <span className="stat-tile-label">Kilométrage</span>
              <span className="stat-tile-value">{bt.kmTraveled !== null ? `${bt.kmTraveled} km` : "—"}</span>
            </div>
            <div className="stat-tile">
              <span className="stat-tile-label">État</span>
              <span className={`badge-pill ${bt.ownerApprovedAt ? "badge-conforme" : "badge-neutral"}`}>
                {bt.ownerApprovedAt ? "Approuvé" : "En cours"}
              </span>
            </div>
          </div>

          <div className="service-call-info-grid" style={{ marginTop: 20 }}>
            <div>
              <span className="service-call-info-label">Qui est allé sur ce déplacement</span>
              {canReassign && !locked ? (
                <div className="service-call-employee-checklist">
                  {employees.map((candidate) => {
                    const assignedIds = bt.assignedEmployees.map((e) => e.id);
                    return (
                      <label key={candidate.id}>
                        <input
                          type="checkbox"
                          checked={assignedIds.includes(candidate.id)}
                          onChange={() =>
                            updateMutation.mutate({
                              assignedEmployeeIds: assignedIds.includes(candidate.id)
                                ? assignedIds.filter((employeeId) => employeeId !== candidate.id)
                                : [...assignedIds, candidate.id],
                            })
                          }
                        />
                        {candidate.name}
                      </label>
                    );
                  })}
                </div>
              ) : (
                <div>{bt.assignedEmployees.length > 0 ? bt.assignedEmployees.map((e) => e.name).join(", ") : "—"}</div>
              )}
            </div>
            <div>
              <span className="service-call-info-label">Prévu le</span>
              <input
                type="date"
                disabled={locked}
                value={scheduled}
                onChange={(event) => setScheduledDraft(event.target.value)}
                onBlur={() => updateMutation.mutate({ scheduledAt: scheduled || null })}
              />
            </div>
          </div>

          <div
            className="section-heading"
            style={{ marginTop: 20, display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}
          >
            <div>
              <h3>Punchs</h3>
              <p>Punchez directement sur ce Bon de travail, ou depuis l'écran Temps.</p>
            </div>
            {!locked && (
              <button type="button" className="btn btn-secondary service-call-btn-small" onClick={() => setPunching(true)}>
                Puncher sur ce Bon de travail
              </button>
            )}
          </div>
          <div className="table-scroll">
            <table className="service-call-table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Employé</th>
                  <th>Tâche</th>
                  <th className="num">Heures</th>
                  <th>Statut</th>
                </tr>
              </thead>
              <tbody>
                {bt.timeEntries.length === 0 && (
                  <tr>
                    <td colSpan={5} style={{ color: "var(--gsc-color-muted)" }}>
                      Aucun punch pour l'instant.
                    </td>
                  </tr>
                )}
                {bt.timeEntries.map((entry) => (
                  <tr key={entry.id}>
                    <td>{formatCalendarDate(entry.date)}</td>
                    <td>{entry.employeeName}</td>
                    <td>{entry.taskLabel ?? "—"}</td>
                    <td className="num">{formatHours(entry.roundedMinutes)}</td>
                    <td>{entry.status === "approved" ? "Approuvé" : "Soumis"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="section-heading" style={{ marginTop: 20 }}>
            <div>
              <h3>Pièces</h3>
              <p>Le technicien décrit la pièce; la Direction ajoute le coût réel après coup.</p>
            </div>
          </div>
          <div className="table-scroll">
            <table className="service-call-table">
              <thead>
                <tr>
                  <th>Pièce</th>
                  <th className="num">Qté</th>
                  {showFinancials && <th className="num">Coût</th>}
                  {showFinancials && <th className="num">Prix de vente</th>}
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {pendingParts.map((part) => (
                  <tr key={part.id}>
                    <td>{part.name}</td>
                    <td className="num">{part.qty}</td>
                    {showFinancials && <td className="num">—</td>}
                    {showFinancials && <td className="num">—</td>}
                    <td className="cell-sub">En attente de synchronisation</td>
                  </tr>
                ))}
                {bt.parts.map((part: ServiceCallPartDto) => (
                  <tr key={part.id}>
                    <td>{part.name}</td>
                    <td className="num">
                      {part.qty} {part.unit ?? ""}
                    </td>
                    {showFinancials && (
                      <td className="num">
                        {part.costPerUnit === null && canPrice && !locked ? (
                          <div style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}>
                            <input
                              type="number"
                              min={0}
                              step="0.01"
                              style={{ width: 90 }}
                              placeholder="Coût $"
                              value={priceDrafts[part.id] ?? ""}
                              onChange={(event) => setPriceDrafts((current) => ({ ...current, [part.id]: event.target.value }))}
                            />
                            <button
                              type="button"
                              className="btn btn-secondary service-call-btn-small"
                              disabled={!priceDrafts[part.id]}
                              onClick={() => pricePartMutation.mutate({ partId: part.id, costPerUnit: Number(priceDrafts[part.id]) })}
                            >
                              Tarifer
                            </button>
                          </div>
                        ) : part.costPerUnit !== null ? (
                          formatCurrency(part.costPerUnit)
                        ) : (
                          "Non tarifée"
                        )}
                      </td>
                    )}
                    {showFinancials && <td className="num">{part.salePricePerUnit !== null ? formatCurrency(part.salePricePerUnit) : "—"}</td>}
                    <td>
                      {part.costPerUnit === null && !locked && (
                        <button type="button" className="btn btn-secondary service-call-btn-small" onClick={() => removePartMutation.mutate(part.id)}>
                          Retirer
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {!locked && (
            <div style={{ display: "flex", gap: 8, marginTop: 10, alignItems: "center", flexWrap: "wrap" }}>
              <input
                placeholder="Nom de la pièce"
                value={newPartName}
                onChange={(event) => setNewPartName(event.target.value)}
                style={{ flex: 1, minWidth: 140 }}
              />
              <input
                type="number"
                min={0.01}
                step="0.01"
                value={newPartQty}
                onChange={(event) => setNewPartQty(event.target.value)}
                style={{ width: 80 }}
              />
              <button type="button" className="btn btn-secondary" disabled={!newPartName.trim()} onClick={() => addPartMutation.mutate()}>
                + Ajouter
              </button>
            </div>
          )}

          <div className="section-heading" style={{ marginTop: 20 }}>
            <div>
              <h3>Frais de déplacement</h3>
              <p>Repas en quantité — plusieurs techniciens sur ce Bon de travail peuvent chacun réclamer un repas.</p>
            </div>
          </div>
          <div style={{ display: "flex", gap: 20, alignItems: "center", flexWrap: "wrap" }}>
            <div className="field" style={{ marginBottom: 0 }}>
              <label>Kilométrage</label>
              <input
                type="number"
                min={0}
                step="0.1"
                style={{ width: 100 }}
                disabled={locked}
                value={km}
                onChange={(event) => setKmDraft(event.target.value)}
                onBlur={() => updateMutation.mutate({ kmTraveled: km ? Number(km) : null })}
              />
            </div>
            <div className="field" style={{ marginBottom: 0 }}>
              <label>Déjeuners</label>
              <input
                type="number"
                min={0}
                step={1}
                style={{ width: 70 }}
                disabled={locked}
                value={bt.mealsBreakfastCount}
                onChange={(event) => updateMutation.mutate({ mealsBreakfastCount: Math.max(0, Number(event.target.value) || 0) })}
              />
            </div>
            <div className="field" style={{ marginBottom: 0 }}>
              <label>Dîners</label>
              <input
                type="number"
                min={0}
                step={1}
                style={{ width: 70 }}
                disabled={locked}
                value={bt.mealsLunchCount}
                onChange={(event) => updateMutation.mutate({ mealsLunchCount: Math.max(0, Number(event.target.value) || 0) })}
              />
            </div>
            <div className="field" style={{ marginBottom: 0 }}>
              <label>Soupers</label>
              <input
                type="number"
                min={0}
                step={1}
                style={{ width: 70 }}
                disabled={locked}
                value={bt.mealsDinnerCount}
                onChange={(event) => updateMutation.mutate({ mealsDinnerCount: Math.max(0, Number(event.target.value) || 0) })}
              />
            </div>
          </div>

          <div className="section-heading" style={{ marginTop: 20 }}>
            <div>
              <h3>Résumé</h3>
              <p>Obligatoire avant l'approbation.</p>
            </div>
          </div>
          <textarea
            rows={3}
            style={{ width: "100%" }}
            disabled={locked}
            value={summary}
            onChange={(event) => setSummaryDraft(event.target.value)}
            onBlur={() => summaryDraft !== null && updateMutation.mutate({ summary: summaryDraft.trim() || null })}
          />

          <div className="section-heading" style={{ marginTop: 20 }}>
            <div>
              <h3>Signature client</h3>
              <p>Obligatoire avant l'approbation.</p>
            </div>
          </div>
          {pendingSignature ? (
            <div>
              <img src={pendingSignature.dataUrl} alt="Signature du client" className="signature-pad-preview" />
              <p style={{ margin: "6px 0 0", fontSize: 13, color: "var(--gsc-color-muted)" }}>
                Signé par {pendingSignature.signerName} — en attente de synchronisation.
              </p>
            </div>
          ) : bt.signatureCaptured && bt.signatureImageUrl ? (
            <div>
              <img src={bt.signatureImageUrl} alt="Signature du client" className="signature-pad-preview" />
              {bt.signatureSignerName && (
                <p style={{ margin: "6px 0 0", fontSize: 13, color: "var(--gsc-color-muted)" }}>Signé par {bt.signatureSignerName}.</p>
              )}
              {!bt.ownerApprovedAt && (
                <div style={{ marginTop: 8 }}>
                  <button type="button" className="btn btn-secondary service-call-btn-small" onClick={() => setSigning(true)}>
                    Recapturer
                  </button>
                </div>
              )}
            </div>
          ) : (
            !locked && (
              <button type="button" className="btn btn-secondary" onClick={() => setSigning(true)}>
                Faire signer le client
              </button>
            )
          )}

          {showFinancials && (
            <>
              <div className="section-heading" style={{ marginTop: 20 }}>
                <div>
                  <h3>Totaux</h3>
                  {pendingTimeEntryCount > 0 && (
                    <p>
                      {pendingTimeEntryCount} punch{pendingTimeEntryCount > 1 ? "s" : ""} en attente d'approbation — pas encore compté
                      {pendingTimeEntryCount > 1 ? "s" : ""} dans la main-d'œuvre ci-dessous.
                    </p>
                  )}
                </div>
              </div>
              <div className="service-call-totals-grid">
                <div>
                  <span>Main-d'œuvre (coût)</span>
                  <strong>{formatCurrency(bt.totals.laborCost ?? 0)}</strong>
                </div>
                <div>
                  <span>Main-d'œuvre (vente)</span>
                  <strong>{formatCurrency(bt.totals.laborSale ?? 0)}</strong>
                </div>
                <div>
                  <span>Pièces (coût)</span>
                  <strong>{formatCurrency(bt.totals.partsCost ?? 0)}</strong>
                </div>
                <div>
                  <span>Pièces (vente)</span>
                  <strong>{formatCurrency(bt.totals.partsSale ?? 0)}</strong>
                </div>
                <div>
                  <span>Frais de déplacement</span>
                  <strong>{formatCurrency(bt.totals.expenses ?? 0)}</strong>
                </div>
                <div>
                  <span>Total facturé au client</span>
                  <strong>{formatCurrency(bt.totals.totalSale ?? 0)}</strong>
                </div>
              </div>
            </>
          )}

          {(bt.ownerApprovedAt || bt.invoiceNumber) && (
            <p style={{ fontSize: 13, color: "var(--gsc-color-muted)", marginTop: 16 }}>
              {bt.ownerApprovedAt && (
                <>
                  Approuvé le {formatDate(bt.ownerApprovedAt)} par {bt.ownerApprovedByName}.
                </>
              )}
              {bt.invoiceNumber && <> Facturé ({bt.invoiceNumber}).</>}
            </p>
          )}

          {error && <p className="form-error">{error}</p>}
        </div>

        <div className="modal-footer">
          <button type="button" className="btn btn-secondary" onClick={onClose}>
            Fermer
          </button>
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => window.open(`/appels-service/bons-travail/${bt.id}/export`, "_blank", "noopener")}
          >
            📄 Exporter en PDF
          </button>
          {canApprove && !bt.ownerApprovedAt && (
            <button
              type="button"
              className="btn"
              disabled={!bt.summary?.trim() || !bt.signatureCaptured || approveMutation.isPending}
              onClick={() => approveMutation.mutate()}
            >
              {approveMutation.isPending ? "Approbation…" : "Approuver"}
            </button>
          )}
        </div>
      </div>

      {punching && (
        <StartTaskModal
          onClose={() => {
            setPunching(false);
            invalidate();
          }}
          initialValue={{ projectType: "service", bonDeTravailId: bt.id, taskId: "" }}
        />
      )}
      {signing && (
        <SignatureModal
          displayId={bt.displayId}
          onClose={() => setSigning(false)}
          onSave={(dataUrl, signerName) => signatureMutation.mutate({ dataUrl, signerName })}
          saving={signatureMutation.isPending}
        />
      )}
    </div>
  );
}
