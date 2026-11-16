import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { canReassignServiceCall, canCreateBonDeTravail, canDeleteServiceCall, canConfirmInvoiceRequest } from "@gsc-pilot/business-rules";
import { useAuth } from "../../lib/auth/useAuth.js";
import { fetchPunchableEmployees } from "../timePunch/api.js";
import { fetchServiceCallDetail, updateServiceCall, createBonDeTravail, deleteServiceCall, SERVICE_CALL_STATUS_LABELS, type BonDeTravailSummaryDto } from "./api.js";
import { BonDeTravailDetail } from "./BonDeTravailDetail.js";
import { SelectBonsDeTravailModal } from "./SelectBonsDeTravailModal.js";
import "./serviceCalls.css";

interface ServiceCallDetailProps {
  id: string;
  onClose: () => void;
}

function formatDate(iso: string | null): string {
  return iso ? new Date(iso).toLocaleDateString("fr-CA", { year: "numeric", month: "long", day: "numeric" }) : "—";
}

function BonDeTravailRow({ bt, onOpen }: { bt: BonDeTravailSummaryDto; onOpen: () => void }) {
  return (
    <tr onClick={onOpen} style={{ cursor: "pointer" }}>
      <td>{bt.displayId}</td>
      <td>{formatDate(bt.scheduledAt)}</td>
      <td>{bt.assignedEmployees.length > 0 ? bt.assignedEmployees.map((e) => e.name).join(", ") : "—"}</td>
      <td>{bt.signatureCaptured ? "Signé" : "—"}</td>
      <td>
        <span className={`badge-pill ${bt.approved ? "badge-conforme" : "badge-neutral"}`}>{bt.approved ? "Approuvé" : "En cours"}</span>
      </td>
      <td>{bt.invoiceNumber ?? "—"}</td>
    </tr>
  );
}

/**
 * Call de service — devenu un DOSSIER qui contient plusieurs Bons de
 * travail (Chantier D, refonte complète du module — 16 novembre 2026,
 * demande explicite de l'utilisatrice). L'en-tête garde les coordonnées/
 * la demande/les techniciens assignés AU DOSSIER (qui est censé s'en
 * occuper — distinct de qui est réellement allé sur chaque déplacement,
 * voir BonDeTravailDetail.tsx) ; tout le reste (km/heures/repas/
 * signature/approbation/pièces/photos/temps) vit maintenant par Bon de
 * travail, un par déplacement physique.
 */
export function ServiceCallDetail({ id, onClose }: ServiceCallDetailProps) {
  const { employee } = useAuth();
  const queryClient = useQueryClient();
  const detailQuery = useQuery({ queryKey: ["service-call", id], queryFn: () => fetchServiceCallDetail(id) });
  const employeesQuery = useQuery({ queryKey: ["time-entries", "employees"], queryFn: fetchPunchableEmployees });
  const call = detailQuery.data?.serviceCall;

  const [confirmDelete, setConfirmDelete] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [openBtId, setOpenBtId] = useState<string | null>(null);
  const [selectionOpen, setSelectionOpen] = useState(false);

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
  const createBtMutation = useMutation({
    mutationFn: () => createBonDeTravail(id, {}),
    onSuccess: (created) => {
      invalidate();
      setOpenBtId(created.id);
    },
    onError: onMutationError,
  });
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

  const canReassign = canReassignServiceCall(employee.persona);
  const canDelete = canDeleteServiceCall(employee.persona);
  const canCreateBt = canCreateBonDeTravail(employee.persona, call, employee.id);
  const employees = employeesQuery.data?.employees ?? [];

  return (
    <div className="modal-backdrop">
      <div className="modal" style={{ maxWidth: 860 }}>
        <div className="modal-header">
          <div>
            <h2>
              {call.displayId} — {call.company ?? call.contactName}
            </h2>
            <p className="modal-subtitle">
              {call.title} · Créé le {formatDate(call.createdAt)}
            </p>
          </div>
          <button type="button" className="modal-close" onClick={onClose} aria-label="Fermer">
            ×
          </button>
        </div>

        <div className="modal-body">
          <div className="stat-tile-grid">
            <div className="stat-tile">
              <span className="stat-tile-label">Bons de travail</span>
              <span className="stat-tile-value">{call.bonsDeTravail.length}</span>
            </div>
            <div className="stat-tile">
              <span className="stat-tile-label">Statut</span>
              <span className={`badge-pill ${call.derivedStatus === "invoiced" ? "badge-conforme" : "badge-neutral"}`}>
                {SERVICE_CALL_STATUS_LABELS[call.derivedStatus]}
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
              <span className="service-call-info-label">Qui s'occupe de ce dossier (facultatif)</span>
              {canReassign ? (
                <div className="service-call-employee-checklist">
                  {employees.map((candidate) => {
                    const assignedIds = call.assignedEmployees.map((e) => e.id);
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
                <div>{call.assignedEmployees.length > 0 ? call.assignedEmployees.map((e) => e.name).join(", ") : "—"}</div>
              )}
            </div>
          </div>

          <div
            className="section-heading"
            style={{ marginTop: 20, display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}
          >
            <div>
              <h3>Bons de travail</h3>
              <p>Un par déplacement — un technicien assigné peut créer le sien, Direction peut en rattraper un oublié.</p>
            </div>
            {canCreateBt && (
              <button type="button" className="btn btn-secondary service-call-btn-small" disabled={createBtMutation.isPending} onClick={() => createBtMutation.mutate()}>
                {createBtMutation.isPending ? "Création…" : "+ Nouveau Bon de travail"}
              </button>
            )}
          </div>
          <div className="table-scroll">
            <table className="service-call-table">
              <thead>
                <tr>
                  <th>Bon de travail</th>
                  <th>Prévu</th>
                  <th>Techniciens</th>
                  <th>Signature</th>
                  <th>Approbation</th>
                  <th>Facture</th>
                </tr>
              </thead>
              <tbody>
                {call.bonsDeTravail.length === 0 && (
                  <tr>
                    <td colSpan={6} style={{ color: "var(--gsc-color-muted)" }}>
                      Aucun Bon de travail pour l'instant.
                    </td>
                  </tr>
                )}
                {call.bonsDeTravail.map((bt) => (
                  <BonDeTravailRow key={bt.id} bt={bt} onOpen={() => setOpenBtId(bt.id)} />
                ))}
              </tbody>
            </table>
          </div>

          {(call.projectId || call.rollingId) && (
            <p style={{ fontSize: 13, color: "var(--gsc-color-muted)", marginTop: 16 }}>
              {call.projectId
                ? "Call lié à un projet (sous-garantie) — les frais s'appliquent au projet, ce call ne sera jamais facturé séparément."
                : "Call lié à un roulement — les frais s'appliquent au roulement, ce call ne sera jamais facturé séparément."}
            </p>
          )}

          {error && <p className="form-error">{error}</p>}
        </div>

        <div className="modal-footer">
          {canDelete && (
            <div style={{ marginRight: "auto", display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
              {!confirmDelete ? (
                <button type="button" className="btn btn-secondary service-call-btn-small" onClick={() => setConfirmDelete(true)}>
                  Supprimer la demande
                </button>
              ) : (
                <>
                  <span style={{ fontSize: 13 }}>Envoyer à la corbeille — confirmer ?</span>
                  <button type="button" className="btn service-call-btn-small" disabled={deleteMutation.isPending} onClick={() => deleteMutation.mutate()}>
                    {deleteMutation.isPending ? "…" : "Confirmer la suppression"}
                  </button>
                  <button type="button" className="btn btn-secondary service-call-btn-small" onClick={() => setConfirmDelete(false)}>
                    Annuler
                  </button>
                </>
              )}
            </div>
          )}
          {canConfirmInvoiceRequest(employee.persona) && !call.projectId && !call.rollingId && (
            <button type="button" className="btn btn-secondary" onClick={() => setSelectionOpen(true)}>
              Sélectionner les Bons de travail à facturer
            </button>
          )}
          <button type="button" className="btn btn-secondary" onClick={onClose}>
            Fermer
          </button>
        </div>
      </div>

      {openBtId && <BonDeTravailDetail id={openBtId} onClose={() => setOpenBtId(null)} />}
      {selectionOpen && (
        <SelectBonsDeTravailModal
          serviceCallId={id}
          serviceCallDisplayId={call.displayId}
          onClose={() => setSelectionOpen(false)}
          onSuccess={invalidate}
        />
      )}
    </div>
  );
}
