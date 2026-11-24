import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { externalSaleLineAmount } from "@gsc-pilot/business-rules";
import { ApiError } from "../../lib/apiClient.js";
import { ContactSearchField } from "../contacts/ContactAutocomplete.js";
import type { ContactListItemDto } from "../contacts/api.js";
import { STATUS_LABELS, PENDING_STATUSES } from "../purchases/api.js";
import {
  updateExternalSaleHeader,
  addExternalSaleLine,
  updateExternalSaleLine,
  removeExternalSaleLine,
  formatCurrency,
  type ExternalSaleDetailDto,
} from "./api.js";

interface ExternalSaleEditFormProps {
  sale: ExternalSaleDetailDto;
  onClose: () => void;
}

interface LineDraft {
  description: string;
  qty: string;
  unitCost: string;
}

const emptyLineDraft: LineDraft = { description: "", qty: "1", unitCost: "" };

/**
 * Modifier la vente (23 novembre 2026, demande explicite) — contrairement à
 * ExternalSaleForm.tsx (tout en un seul lot à la création), chaque geste
 * ici est son propre appel API : les lignes sont déjà des PurchaseRequest
 * indépendantes avec leur propre cycle d'approbation
 * (externalSales/service.ts). Une ligne qui n'est plus owner_pending/
 * boss_pending s'affiche en lecture seule — sa correction passe par le
 * module Achats existant (setPurchaseRequestAmount), jamais contournée ici.
 * Gelé côté serveur dès que invoiceRequestedAt est posé (voir
 * ExternalSaleDetail.tsx, qui n'affiche le bouton « Modifier » que sinon).
 */
export function ExternalSaleEditForm({ sale, onClose }: ExternalSaleEditFormProps) {
  const queryClient = useQueryClient();
  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ["external-sale", sale.id] });
    void queryClient.invalidateQueries({ queryKey: ["external-sales"] });
  };

  const [contactName, setContactName] = useState(sale.contactName);
  const [company, setCompany] = useState(sale.company ?? "");
  const [contactRole, setContactRole] = useState(sale.contactRole ?? "");
  const [phone, setPhone] = useState(sale.phone ?? "");
  const [email, setEmail] = useState(sale.email ?? "");
  const [transportFee, setTransportFee] = useState(String(sale.transportFee));
  const [adminFee, setAdminFee] = useState(String(sale.adminFee));
  const [marginPct, setMarginPct] = useState(String(sale.marginPct));
  const [error, setError] = useState<string | null>(null);

  const [newLine, setNewLine] = useState<LineDraft>(emptyLineDraft);
  const [editingLineId, setEditingLineId] = useState<string | null>(null);
  const [editLine, setEditLine] = useState<LineDraft>(emptyLineDraft);

  const onMutationError = (err: unknown) => setError(err instanceof ApiError ? err.message : "Une erreur est survenue — réessayez.");

  const headerMutation = useMutation({
    mutationFn: () =>
      updateExternalSaleHeader(sale.id, {
        newContact: {
          contactName: contactName.trim(),
          company: company.trim() || undefined,
          contactRole: contactRole.trim() || undefined,
          phone: phone.trim() || undefined,
          email: email.trim() || undefined,
        },
        transportFee: Number(transportFee) || 0,
        adminFee: Number(adminFee) || 0,
        marginPct: Number(marginPct) || 0,
      }),
    onSuccess: () => {
      setError(null);
      invalidate();
    },
    onError: onMutationError,
  });

  const addMutation = useMutation({
    mutationFn: () =>
      addExternalSaleLine(sale.id, { description: newLine.description.trim(), qty: Number(newLine.qty) || 0, unitCost: Number(newLine.unitCost) || 0 }),
    onSuccess: () => {
      setError(null);
      setNewLine(emptyLineDraft);
      invalidate();
    },
    onError: onMutationError,
  });

  const updateLineMutation = useMutation({
    mutationFn: () =>
      updateExternalSaleLine(sale.id, editingLineId!, {
        description: editLine.description.trim(),
        qty: Number(editLine.qty) || 0,
        unitCost: Number(editLine.unitCost) || 0,
      }),
    onSuccess: () => {
      setError(null);
      setEditingLineId(null);
      invalidate();
    },
    onError: onMutationError,
  });

  const removeMutation = useMutation({
    mutationFn: (lineId: string) => removeExternalSaleLine(sale.id, lineId),
    onSuccess: () => {
      setError(null);
      invalidate();
    },
    onError: onMutationError,
  });

  function applyContact(contact: ContactListItemDto) {
    setContactName(contact.name);
    setCompany(contact.company ?? "");
    setPhone(contact.phone ?? "");
    setEmail(contact.email ?? "");
  }

  function startEditingLine(line: ExternalSaleDetailDto["lines"][number]) {
    setEditingLineId(line.id);
    setEditLine({ description: line.description, qty: String(line.qty ?? ""), unitCost: String(line.unitCost ?? "") });
  }

  const canSaveHeader = contactName.trim().length > 0 && !headerMutation.isPending;
  const canAddLine = newLine.description.trim().length > 0 && !addMutation.isPending;
  const canSaveLine = editLine.description.trim().length > 0 && !updateLineMutation.isPending;

  return (
    <div className="modal-backdrop">
      <div className="modal" style={{ maxWidth: 820 }} onClick={(event) => event.stopPropagation()}>
        <div className="modal-header">
          <div>
            <h2>Modifier la vente {sale.displayId}</h2>
            <p className="modal-subtitle">Chaque changement ci-dessous est enregistré séparément.</p>
          </div>
          <button type="button" className="modal-close" onClick={onClose} aria-label="Fermer">
            ×
          </button>
        </div>

        <div className="modal-body">
          {error && <p className="form-error">{error}</p>}

          <h4 style={{ margin: "0 0 8px" }}>Contact</h4>
          <div className="form-grid">
            <ContactSearchField id="ve-edit-contactName" label="Nom du contact" field="name" value={contactName} onChange={setContactName} onSelect={applyContact} />
            <ContactSearchField id="ve-edit-company" label="Entreprise (facultatif)" field="company" value={company} onChange={setCompany} onSelect={applyContact} />
            <div className="field">
              <label htmlFor="ve-edit-role">Rôle (facultatif)</label>
              <input id="ve-edit-role" value={contactRole} onChange={(e) => setContactRole(e.target.value)} />
            </div>
            <div className="field">
              <label htmlFor="ve-edit-phone">Téléphone (facultatif)</label>
              <input id="ve-edit-phone" value={phone} onChange={(e) => setPhone(e.target.value)} />
            </div>
            <div className="field">
              <label htmlFor="ve-edit-email">Courriel (facultatif)</label>
              <input id="ve-edit-email" value={email} onChange={(e) => setEmail(e.target.value)} />
            </div>
          </div>

          <h4 style={{ margin: "16px 0 8px" }}>Frais et marge</h4>
          <div className="form-grid">
            <div className="field">
              <label htmlFor="ve-edit-transport">Frais de transport ($)</label>
              <input id="ve-edit-transport" type="number" min={0} step="0.01" value={transportFee} onChange={(e) => setTransportFee(e.target.value)} />
            </div>
            <div className="field">
              <label htmlFor="ve-edit-admin">Frais administratifs ($)</label>
              <input id="ve-edit-admin" type="number" min={0} step="0.01" value={adminFee} onChange={(e) => setAdminFee(e.target.value)} />
            </div>
            <div className="field">
              <label htmlFor="ve-edit-margin">Marge (%)</label>
              <input id="ve-edit-margin" type="number" min={0} max={99.99} step="0.1" value={marginPct} onChange={(e) => setMarginPct(e.target.value)} />
            </div>
            <div className="field field-full">
              <button type="button" className="btn btn-small" disabled={!canSaveHeader} onClick={() => headerMutation.mutate()}>
                {headerMutation.isPending ? "…" : "Enregistrer le contact et les frais"}
              </button>
            </div>
          </div>

          <h4 style={{ margin: "16px 0 8px" }}>Pièces</h4>
          <div className="table-scroll">
            <table className="shortlist-table">
              <thead>
                <tr>
                  <th>Description</th>
                  <th>Qté</th>
                  <th>Coût unitaire</th>
                  <th className="num">Sous-total</th>
                  <th>Statut</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {sale.lines.map((line) => {
                  const pending = PENDING_STATUSES.includes(line.status);
                  const isEditing = pending && editingLineId === line.id;

                  if (isEditing) {
                    return (
                      <tr key={line.id}>
                        <td>
                          <input value={editLine.description} onChange={(e) => setEditLine({ ...editLine, description: e.target.value })} />
                        </td>
                        <td>
                          <input type="number" min={0} step="0.01" value={editLine.qty} onChange={(e) => setEditLine({ ...editLine, qty: e.target.value })} />
                        </td>
                        <td>
                          <input type="number" min={0} step="0.01" value={editLine.unitCost} onChange={(e) => setEditLine({ ...editLine, unitCost: e.target.value })} />
                        </td>
                        <td className="num">{formatCurrency(externalSaleLineAmount(Number(editLine.qty) || 0, Number(editLine.unitCost) || 0))}</td>
                        <td>{STATUS_LABELS[line.status] ?? line.status}</td>
                        <td style={{ display: "flex", gap: 4 }}>
                          <button type="button" className="btn btn-small" disabled={!canSaveLine} onClick={() => updateLineMutation.mutate()}>
                            {updateLineMutation.isPending ? "…" : "✓"}
                          </button>
                          <button type="button" className="btn btn-secondary btn-small" onClick={() => setEditingLineId(null)}>
                            Annuler
                          </button>
                        </td>
                      </tr>
                    );
                  }

                  return (
                    <tr key={line.id}>
                      <td>{line.description}</td>
                      <td>{line.qty ?? "—"}</td>
                      <td>{line.unitCost != null ? formatCurrency(line.unitCost) : "—"}</td>
                      <td className="num">{line.amount != null ? formatCurrency(line.amount) : "—"}</td>
                      <td>{STATUS_LABELS[line.status] ?? line.status}</td>
                      <td style={{ display: "flex", gap: 4 }}>
                        {pending && (
                          <>
                            <button type="button" className="btn btn-secondary btn-small" onClick={() => startEditingLine(line)}>
                              Modifier
                            </button>
                            <button
                              type="button"
                              className="icon-btn"
                              title="Retirer"
                              disabled={removeMutation.isPending}
                              onClick={() => removeMutation.mutate(line.id)}
                            >
                              ×
                            </button>
                          </>
                        )}
                      </td>
                    </tr>
                  );
                })}
                <tr>
                  <td>
                    <input placeholder="Nouvelle ligne" value={newLine.description} onChange={(e) => setNewLine({ ...newLine, description: e.target.value })} />
                  </td>
                  <td>
                    <input type="number" min={0} step="0.01" value={newLine.qty} onChange={(e) => setNewLine({ ...newLine, qty: e.target.value })} />
                  </td>
                  <td>
                    <input type="number" min={0} step="0.01" value={newLine.unitCost} onChange={(e) => setNewLine({ ...newLine, unitCost: e.target.value })} />
                  </td>
                  <td className="num">{formatCurrency(externalSaleLineAmount(Number(newLine.qty) || 0, Number(newLine.unitCost) || 0))}</td>
                  <td />
                  <td>
                    <button type="button" className="btn btn-small" disabled={!canAddLine} onClick={() => addMutation.mutate()}>
                      {addMutation.isPending ? "…" : "+ Ajouter"}
                    </button>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          <div className="stat-tile-grid" style={{ marginTop: 16 }}>
            <div className="stat-tile">
              <span className="stat-tile-label">Coût des pièces</span>
              <span className="stat-tile-value">{formatCurrency(sale.partsBaseCost)}</span>
            </div>
            <div className="stat-tile">
              <span className="stat-tile-label">Prix vendu</span>
              <span className="stat-tile-value">{formatCurrency(sale.salePrice)}</span>
            </div>
          </div>
          <p className="cell-sub" style={{ marginTop: 6 }}>
            Ces totaux reflètent la dernière sauvegarde — ils se mettent à jour après chaque enregistrement ci-dessus.
          </p>
        </div>

        <div className="modal-footer">
          <button type="button" className="btn btn-secondary" onClick={onClose}>
            Fermer
          </button>
        </div>
      </div>
    </div>
  );
}
