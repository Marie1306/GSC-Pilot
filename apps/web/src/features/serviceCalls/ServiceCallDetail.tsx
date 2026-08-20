import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  canReassignServiceCall,
  canPriceServiceParts,
  canApproveServiceCall,
  canSendServiceCallToAdmin,
  canSeeServicePricing,
  canDeleteServiceCall,
} from "@gsc-pilot/business-rules";
import { useAuth } from "../../lib/auth/useAuth.js";
import { fetchPunchableEmployees } from "../timePunch/api.js";
import { StartTaskModal } from "../timePunch/StartTaskModal.js";
import {
  fetchServiceCallDetail,
  updateServiceCall,
  addServiceCallPart,
  removeServiceCallPart,
  priceServiceCallPart,
  captureServiceCallSignature,
  approveServiceCall,
  sendServiceCallToAdmin,
  deleteServiceCall,
  MEAL_LABELS,
  type ServiceCallPartDto,
} from "./api.js";
import { SignatureModal } from "./SignatureModal.js";
import "./serviceCalls.css";

interface ServiceCallDetailProps {
  id: string;
  onClose: () => void;
}

const MEAL_TYPES = ["breakfast", "lunch", "dinner"] as const;

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

export function ServiceCallDetail({ id, onClose }: ServiceCallDetailProps) {
  const { employee } = useAuth();
  const queryClient = useQueryClient();
  const detailQuery = useQuery({ queryKey: ["service-call", id], queryFn: () => fetchServiceCallDetail(id) });
  const employeesQuery = useQuery({ queryKey: ["time-entries", "employees"], queryFn: fetchPunchableEmployees });
  const call = detailQuery.data?.serviceCall;

  const [summaryDraft, setSummaryDraft] = useState<string | null>(null);
  const [kmDraft, setKmDraft] = useState<string | null>(null);
  const [mealsDraft, setMealsDraft] = useState<string[] | null>(null);
  const [newPartName, setNewPartName] = useState("");
  const [newPartQty, setNewPartQty] = useState("1");
  const [priceDrafts, setPriceDrafts] = useState<Record<string, string>>({});
  const [signing, setSigning] = useState(false);
  const [punching, setPunching] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ["service-call", id] });
    void queryClient.invalidateQueries({ queryKey: ["service-calls"] });
  };
  const onMutationError = (err: unknown) => setError(err instanceof Error ? err.message : "Erreur — réessayez.");

  const updateMutation = useMutation({
    mutationFn: (patch: Parameters<typeof updateServiceCall>[1]) => updateServiceCall(id, patch),
    onSuccess: invalidate,
    onError: onMutationError,
  });
  const addPartMutation = useMutation({
    mutationFn: () => addServiceCallPart(id, { name: newPartName.trim(), qty: Number(newPartQty) }),
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
    mutationFn: (dataUrl: string) => captureServiceCallSignature(id, dataUrl),
    onSuccess: () => {
      setSigning(false);
      invalidate();
    },
    onError: onMutationError,
  });
  const approveMutation = useMutation({ mutationFn: () => approveServiceCall(id), onSuccess: invalidate, onError: onMutationError });
  const sendMutation = useMutation({ mutationFn: () => sendServiceCallToAdmin(id), onSuccess: invalidate, onError: onMutationError });
  const deleteMutation = useMutation({
    mutationFn: () => deleteServiceCall(id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["service-calls"] });
      onClose();
    },
    onError: onMutationError,
  });

  if (!call || !employee) {
    return (
      <div className="modal-backdrop">
        <div className="modal">
          <div className="modal-body">{detailQuery.isError ? "Call introuvable." : "Chargement…"}</div>
        </div>
      </div>
    );
  }

  const showFinancials = canSeeServicePricing(employee.persona);
  const canReassign = canReassignServiceCall(employee.persona);
  const canPrice = canPriceServiceParts(employee.persona);
  const canApprove = canApproveServiceCall(employee.persona);
  const canSend = canSendServiceCallToAdmin(employee.persona);
  const canDelete = canDeleteServiceCall(employee.persona);
  const employees = employeesQuery.data?.employees ?? [];
  const totalMinutes = call.timeEntries.reduce((sum, entry) => sum + (entry.roundedMinutes ?? 0), 0);

  const summary = summaryDraft ?? call.summary ?? "";
  const km = kmDraft ?? (call.kmTraveled !== null ? String(call.kmTraveled) : "");
  const meals = mealsDraft ?? call.mealsClaimed;

  function toggleMeal(meal: string) {
    const current = meals;
    const next = current.includes(meal) ? current.filter((m) => m !== meal) : [...current, meal];
    setMealsDraft(next);
    updateMutation.mutate({ mealsClaimed: next });
  }

  return (
    <div className="modal-backdrop">
      <div className="modal" style={{ maxWidth: 860 }}>
        <div className="modal-header">
          <div>
            <h2>
              {call.displayId} — {call.company ?? call.contactName}
            </h2>
            <p className="modal-subtitle">
              {call.request} · Créé le {formatDate(call.createdAt)}
            </p>
          </div>
          <button type="button" className="modal-close" onClick={onClose} aria-label="Fermer">
            ×
          </button>
        </div>

        <div className="modal-body">
          <div className="stat-tile-grid">
            <div className="stat-tile">
              <span className="stat-tile-label">Techniciens actifs</span>
              <span className="stat-tile-value">{call.assignedEmployees.length}</span>
            </div>
            <div className="stat-tile">
              <span className="stat-tile-label">Temps comptabilisé</span>
              <span className="stat-tile-value">{formatHours(totalMinutes)}</span>
            </div>
            <div className="stat-tile">
              <span className="stat-tile-label">Kilométrage</span>
              <span className="stat-tile-value">{call.kmTraveled !== null ? `${call.kmTraveled} km` : "—"}</span>
            </div>
            <div className="stat-tile">
              <span className="stat-tile-label">État</span>
              <span className={`badge-pill ${call.status === "approved" ? "badge-conforme" : "badge-neutral"}`}>
                {call.status === "approved" ? "Approuvé" : "Planifié"}
              </span>
            </div>
          </div>

          <div className="section-heading" style={{ marginTop: 20 }}>
            <div>
              <h3>Demande et coordonnées</h3>
            </div>
          </div>
          <div className="service-call-contact-card">
            <strong>
              {call.contactName}
              {call.company ? ` — ${call.company}` : ""}
            </strong>
            <p className="service-call-contact-request">{call.request}</p>
            <div className="service-call-contact-line">📍 {call.address ?? "—"}</div>
            <div className="service-call-contact-line">
              📞 {call.contactPhone ?? "—"} · ✉ {call.contactEmail ?? "—"}
            </div>
          </div>

          <div className="service-call-info-grid">
            <div>
              <span className="service-call-info-label">Techniciens assignés</span>
              {canReassign ? (
                <div className="service-call-employee-checklist">
                  {employees.map((candidate) => {
                    const assignedIds = call.assignedEmployees.map((employee) => employee.id);
                    return (
                      <label key={candidate.id}>
                        <input
                          type="checkbox"
                          checked={assignedIds.includes(candidate.id)}
                          onChange={() =>
                            updateMutation.mutate({
                              assignedEmployeeIds: assignedIds.includes(candidate.id)
                                ? assignedIds.filter((id) => id !== candidate.id)
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
                <div>{call.assignedEmployees.length > 0 ? call.assignedEmployees.map((employee) => employee.name).join(", ") : "—"}</div>
              )}
            </div>
            <div>
              <span className="service-call-info-label">Prévu le</span>
              <div>{formatDate(call.scheduledAt)}</div>
            </div>
          </div>

          <div className="section-heading" style={{ marginTop: 20, display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
            <div>
              <h3>Punchs</h3>
              <p>Punchez directement sur ce call, ou depuis l'écran Temps.</p>
            </div>
            <button type="button" className="btn btn-secondary service-call-btn-small" onClick={() => setPunching(true)}>
              Puncher sur ce call
            </button>
          </div>
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
              {call.timeEntries.length === 0 && (
                <tr>
                  <td colSpan={5} style={{ color: "var(--gsc-color-muted)" }}>
                    Aucun punch pour l'instant.
                  </td>
                </tr>
              )}
              {call.timeEntries.map((entry) => (
                <tr key={entry.id}>
                  <td>{formatDate(entry.date)}</td>
                  <td>{entry.employeeName}</td>
                  <td>{entry.taskLabel ?? "—"}</td>
                  <td className="num">{formatHours(entry.roundedMinutes)}</td>
                  <td>{entry.status === "approved" ? "Approuvé" : "Soumis"}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <div className="section-heading" style={{ marginTop: 20 }}>
            <div>
              <h3>Pièces</h3>
              <p>Le technicien décrit la pièce; la Direction ajoute le coût réel après coup.</p>
            </div>
          </div>
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
              {call.parts.map((part: ServiceCallPartDto) => (
                <tr key={part.id}>
                  <td>{part.name}</td>
                  <td className="num">
                    {part.qty} {part.unit ?? ""}
                  </td>
                  {showFinancials && (
                    <td className="num">
                      {part.costPerUnit === null && canPrice ? (
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
                      ) : (
                        (part.costPerUnit !== null ? formatCurrency(part.costPerUnit) : "Non tarifée")
                      )}
                    </td>
                  )}
                  {showFinancials && <td className="num">{part.salePricePerUnit !== null ? formatCurrency(part.salePricePerUnit) : "—"}</td>}
                  <td>
                    {part.costPerUnit === null && (
                      <button type="button" className="btn btn-secondary service-call-btn-small" onClick={() => removePartMutation.mutate(part.id)}>
                        Retirer
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div style={{ display: "flex", gap: 8, marginTop: 10, alignItems: "center" }}>
            <input placeholder="Nom de la pièce" value={newPartName} onChange={(event) => setNewPartName(event.target.value)} style={{ flex: 1 }} />
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

          <div className="section-heading" style={{ marginTop: 20 }}>
            <div>
              <h3>Frais de déplacement</h3>
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
                value={km}
                onChange={(event) => setKmDraft(event.target.value)}
                onBlur={() => updateMutation.mutate({ kmTraveled: km ? Number(km) : null })}
              />
            </div>
            {MEAL_TYPES.map((meal) => (
              <label key={meal} style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <input type="checkbox" checked={meals.includes(meal)} onChange={() => toggleMeal(meal)} />
                {MEAL_LABELS[meal]}
              </label>
            ))}
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
            value={summary}
            onChange={(event) => setSummaryDraft(event.target.value)}
            onBlur={() => summaryDraft !== null && updateMutation.mutate({ summary: summaryDraft.trim() || null })}
          />
          <div style={{ marginTop: 10 }}>
            <button
              type="button"
              className="btn btn-secondary"
              disabled={updateMutation.isPending}
              onClick={() => updateMutation.mutate({ summary: summary.trim() || null, kmTraveled: km ? Number(km) : null, mealsClaimed: meals })}
            >
              {updateMutation.isPending ? "Enregistrement…" : "Enregistrer les données terrain"}
            </button>
          </div>

          <div className="section-heading" style={{ marginTop: 20 }}>
            <div>
              <h3>Signature client</h3>
              <p>Obligatoire avant l'approbation.</p>
            </div>
          </div>
          {call.signatureCaptured && call.signatureImageUrl ? (
            <div>
              <img src={call.signatureImageUrl} alt="Signature du client" className="signature-pad-preview" />
              {call.status !== "approved" && (
                <div style={{ marginTop: 8 }}>
                  <button type="button" className="btn btn-secondary service-call-btn-small" onClick={() => setSigning(true)}>
                    Recapturer
                  </button>
                </div>
              )}
            </div>
          ) : (
            <button type="button" className="btn btn-secondary" onClick={() => setSigning(true)}>
              Faire signer le client
            </button>
          )}

          {showFinancials && (
            <>
              <div className="section-heading" style={{ marginTop: 20 }}>
                <div>
                  <h3>Totaux</h3>
                </div>
              </div>
              <div className="service-call-totals-grid">
                <div>
                  <span>Main-d'œuvre (coût)</span>
                  <strong>{formatCurrency(call.totals.laborCost ?? 0)}</strong>
                </div>
                <div>
                  <span>Main-d'œuvre (vente)</span>
                  <strong>{formatCurrency(call.totals.laborSale ?? 0)}</strong>
                </div>
                <div>
                  <span>Pièces (coût)</span>
                  <strong>{formatCurrency(call.totals.partsCost ?? 0)}</strong>
                </div>
                <div>
                  <span>Pièces (vente)</span>
                  <strong>{formatCurrency(call.totals.partsSale ?? 0)}</strong>
                </div>
                <div>
                  <span>Frais de déplacement</span>
                  <strong>{formatCurrency(call.totals.expenses ?? 0)}</strong>
                </div>
                <div>
                  <span>Total facturé au client</span>
                  <strong>{formatCurrency(call.totals.totalSale ?? 0)}</strong>
                </div>
              </div>
            </>
          )}

          {(call.ownerApprovedAt || call.sentToAdminAt) && (
            <p style={{ fontSize: 13, color: "var(--gsc-color-muted)", marginTop: 16 }}>
              {call.ownerApprovedAt && (
                <>
                  Approuvé le {formatDate(call.ownerApprovedAt)} par {call.ownerApprovedByName}.
                </>
              )}
              {call.sentToAdminAt && <> Envoyé à l'administration le {formatDate(call.sentToAdminAt)}.</>}
            </p>
          )}

          {error && <p className="form-error">{error}</p>}
        </div>

        <div className="modal-footer">
          {canDelete && (
            <div style={{ marginRight: "auto", display: "flex", gap: 8, alignItems: "center" }}>
              {!confirmDelete ? (
                <button type="button" className="btn btn-secondary service-call-btn-small" onClick={() => setConfirmDelete(true)}>
                  Supprimer la demande
                </button>
              ) : (
                <>
                  <span style={{ fontSize: 13 }}>Envoyer à la corbeille — confirmer ?</span>
                  <button
                    type="button"
                    className="btn service-call-btn-small"
                    disabled={deleteMutation.isPending}
                    onClick={() => deleteMutation.mutate()}
                  >
                    {deleteMutation.isPending ? "…" : "Confirmer la suppression"}
                  </button>
                  <button type="button" className="btn btn-secondary service-call-btn-small" onClick={() => setConfirmDelete(false)}>
                    Annuler
                  </button>
                </>
              )}
            </div>
          )}
          <button type="button" className="btn btn-secondary" onClick={onClose}>
            Fermer
          </button>
          {canApprove && call.status !== "approved" && (
            <button
              type="button"
              className="btn"
              disabled={!call.summary?.trim() || !call.signatureCaptured || approveMutation.isPending}
              onClick={() => approveMutation.mutate()}
            >
              {approveMutation.isPending ? "Approbation…" : "Approuver"}
            </button>
          )}
          {canSend && call.status === "approved" && !call.sentToAdminAt && (
            <button type="button" className="btn" disabled={sendMutation.isPending} onClick={() => sendMutation.mutate()}>
              {sendMutation.isPending ? "Envoi…" : "Envoyer à l'administration"}
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
          initialValue={{ projectType: "service", serviceCallId: call.id, taskId: "" }}
        />
      )}
      {signing && (
        <SignatureModal
          onClose={() => setSigning(false)}
          onSave={(dataUrl) => signatureMutation.mutate(dataUrl)}
          saving={signatureMutation.isPending}
        />
      )}
    </div>
  );
}
