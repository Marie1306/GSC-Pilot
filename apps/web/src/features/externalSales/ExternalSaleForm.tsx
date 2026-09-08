import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { externalSaleLineAmount, externalSaleTotals } from "@gsc-pilot/business-rules";
import { ApiError } from "../../lib/apiClient.js";
import { ContactSearchField } from "../contacts/ContactAutocomplete.js";
import type { ContactListItemDto } from "../contacts/api.js";
import { createExternalSale, fetchNextExternalSaleNumber, formatCurrency, type ExternalSaleLineInput } from "./api.js";

/** Conversion directe d'une demande client (8 septembre 2026) — même patron que RollingForm/ServiceCallForm/ProjectForm. */
export interface ExternalSalePrefillFromRequest {
  clientRequestId: string;
  requestDisplayId: string;
  contactName: string;
  company?: string;
  contactRole?: string;
  phone?: string;
  email?: string;
}

interface ExternalSaleFormProps {
  onClose: () => void;
  onCreated: (id: string) => void;
  prefillFromRequest?: ExternalSalePrefillFromRequest;
}

interface LineRow {
  key: number;
  description: string;
  qty: string;
  unitCost: string;
}

function emptyLine(key: number): LineRow {
  return { key, description: "", qty: "1", unitCost: "" };
}

function parsedLines(rows: LineRow[]): ExternalSaleLineInput[] {
  return rows
    .filter((row) => row.description.trim().length > 0)
    .map((row) => ({ description: row.description.trim(), qty: Number(row.qty) || 0, unitCost: Number(row.unitCost) || 0 }));
}

/**
 * Vente externe (8 septembre 2026) — vendre des pièces sans passer par le
 * cycle Projet complet. Frais de transport/administratifs : montants fixes
 * en $, VIDES par défaut (jamais 0 pré-rempli, confirmé explicitement par
 * l'utilisatrice — 0 accepté comme saisie volontaire, pas comme absence de
 * frais). Marge pré-remplie depuis Settings.externalSaleDefaultMarginPct
 * (20 % au départ), éditable. Chaque ligne de pièce devient automatiquement
 * une demande d'achat une fois la vente créée (voir externalSales/service.ts
 * côté serveur) — jamais construite ici, juste décrite.
 */
export function ExternalSaleForm({ onClose, onCreated, prefillFromRequest }: ExternalSaleFormProps) {
  const queryClient = useQueryClient();
  const nextNumberQuery = useQuery({ queryKey: ["external-sales", "next-number"], queryFn: fetchNextExternalSaleNumber });

  const [contactName, setContactName] = useState(prefillFromRequest?.contactName ?? "");
  const [company, setCompany] = useState(prefillFromRequest?.company ?? "");
  const [contactRole, setContactRole] = useState(prefillFromRequest?.contactRole ?? "");
  const [phone, setPhone] = useState(prefillFromRequest?.phone ?? "");
  const [email, setEmail] = useState(prefillFromRequest?.email ?? "");
  const [rows, setRows] = useState<LineRow[]>([emptyLine(0)]);
  const [nextRowKey, setNextRowKey] = useState(1);
  const [transportFee, setTransportFee] = useState("");
  const [adminFee, setAdminFee] = useState("");
  const [marginPct, setMarginPct] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Marge par défaut chargée une fois la réponse arrivée — l'utilisatrice
  // reste libre de la modifier ensuite sans qu'un refetch l'écrase (même
  // patron que ProjectAmendments avec targetMarginPct).
  const effectiveMarginPct = marginPct ?? (nextNumberQuery.data ? String(nextNumberQuery.data.defaultMarginPct) : "20");

  const lines = parsedLines(rows);
  const lineAmounts = lines.map((line) => externalSaleLineAmount(line.qty, line.unitCost));
  const totals = externalSaleTotals(lineAmounts, Number(transportFee) || 0, Number(adminFee) || 0, Number(effectiveMarginPct) || 0);

  const createMutation = useMutation({
    mutationFn: () =>
      createExternalSale({
        clientRequestId: prefillFromRequest?.clientRequestId,
        newContact: {
          contactName: contactName.trim(),
          company: company.trim() || undefined,
          contactRole: contactRole.trim() || undefined,
          phone: phone.trim() || undefined,
          email: email.trim() || undefined,
        },
        lines,
        transportFee: Number(transportFee) || 0,
        adminFee: Number(adminFee) || 0,
        marginPct: Number(effectiveMarginPct) || 0,
      }),
    onSuccess: ({ id }) => {
      void queryClient.invalidateQueries({ queryKey: ["external-sales"] });
      if (prefillFromRequest) {
        void queryClient.invalidateQueries({ queryKey: ["client-request", prefillFromRequest.clientRequestId] });
        void queryClient.invalidateQueries({ queryKey: ["client-requests"] });
      }
      onCreated(id);
    },
    onError: (err: unknown) => setError(err instanceof ApiError ? err.message : "Une erreur est survenue — réessayez."),
  });

  function applyContact(contact: ContactListItemDto) {
    setContactName(contact.name);
    setCompany(contact.company ?? "");
    setPhone(contact.phone ?? "");
    setEmail(contact.email ?? "");
  }

  function updateRow(key: number, patch: Partial<Omit<LineRow, "key">>) {
    setRows((current) => current.map((row) => (row.key === key ? { ...row, ...patch } : row)));
  }
  function addRow() {
    setRows((current) => [...current, emptyLine(nextRowKey)]);
    setNextRowKey((k) => k + 1);
  }
  function removeRow(key: number) {
    setRows((current) => (current.length > 1 ? current.filter((row) => row.key !== key) : current));
  }

  const canSubmit = contactName.trim().length > 0 && lines.length > 0 && !createMutation.isPending;

  return (
    <div className="modal-backdrop">
      <div className="modal" style={{ maxWidth: 760 }} onClick={(event) => event.stopPropagation()}>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            if (canSubmit) createMutation.mutate();
          }}
        >
          <div className="modal-header">
            <div>
              <h2>{prefillFromRequest ? "Convertir en vente" : "Nouvelle vente externe"}</h2>
              <p className="modal-subtitle">
                {prefillFromRequest
                  ? `Pré-rempli depuis la demande ${prefillFromRequest.requestDisplayId} — vérifiez avant de créer.`
                  : "Vendre des pièces sans passer par le cycle Projet complet."}
              </p>
            </div>
            <button type="button" className="modal-close" onClick={onClose} aria-label="Fermer">
              ×
            </button>
          </div>

          <div className="modal-body">
            {error && <p className="form-error">{error}</p>}

            <div className="form-grid">
              <ContactSearchField id="ve-contactName" label="Nom du contact" field="name" value={contactName} onChange={setContactName} onSelect={applyContact} />
              <ContactSearchField id="ve-company" label="Entreprise (facultatif)" field="company" value={company} onChange={setCompany} onSelect={applyContact} />
              <div className="field">
                <label htmlFor="ve-contactRole">Rôle (facultatif)</label>
                <input id="ve-contactRole" value={contactRole} onChange={(e) => setContactRole(e.target.value)} />
              </div>
              <div className="field">
                <label htmlFor="ve-phone">Téléphone (facultatif)</label>
                <input id="ve-phone" value={phone} onChange={(e) => setPhone(e.target.value)} />
              </div>
              <div className="field">
                <label htmlFor="ve-email">Courriel (facultatif)</label>
                <input id="ve-email" value={email} onChange={(e) => setEmail(e.target.value)} />
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
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row, index) => (
                    <tr key={row.key}>
                      <td>
                        <input value={row.description} onChange={(e) => updateRow(row.key, { description: e.target.value })} />
                      </td>
                      <td>
                        <input type="number" min={0} step="0.01" value={row.qty} onFocus={(e) => e.target.select()} onChange={(e) => updateRow(row.key, { qty: e.target.value })} />
                      </td>
                      <td>
                        <input type="number" min={0} step="0.01" value={row.unitCost} onChange={(e) => updateRow(row.key, { unitCost: e.target.value })} />
                      </td>
                      <td className="num">{formatCurrency(externalSaleLineAmount(Number(row.qty) || 0, Number(row.unitCost) || 0))}</td>
                      <td>
                        {rows.length > 1 && (
                          <button type="button" className="btn btn-secondary btn-small" onClick={() => removeRow(row.key)} aria-label={`Retirer la ligne ${index + 1}`}>
                            ×
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <button type="button" className="btn btn-secondary btn-small" onClick={addRow} style={{ marginTop: 8 }}>
              + Ajouter une ligne
            </button>

            <div className="form-grid" style={{ marginTop: 16 }}>
              <div className="field">
                <label htmlFor="ve-transport">Frais de transport ($, facultatif)</label>
                <input id="ve-transport" type="number" min={0} step="0.01" placeholder="—" value={transportFee} onChange={(e) => setTransportFee(e.target.value)} />
              </div>
              <div className="field">
                <label htmlFor="ve-admin">Frais administratifs ($, facultatif)</label>
                <input id="ve-admin" type="number" min={0} step="0.01" placeholder="—" value={adminFee} onChange={(e) => setAdminFee(e.target.value)} />
              </div>
              <div className="field">
                <label htmlFor="ve-margin">Marge (%)</label>
                <input id="ve-margin" type="number" min={0} max={99.99} step="0.1" value={effectiveMarginPct} onChange={(e) => setMarginPct(e.target.value)} />
              </div>
            </div>

            <div className="stat-tile-grid" style={{ marginTop: 16 }}>
              <div className="stat-tile">
                <span className="stat-tile-label">Coût des pièces</span>
                <span className="stat-tile-value">{formatCurrency(totals.partsBaseCost)}</span>
              </div>
              <div className="stat-tile">
                <span className="stat-tile-label">Coût avant marge</span>
                <span className="stat-tile-value">{formatCurrency(totals.baseCostBeforeMargin)}</span>
              </div>
              <div className="stat-tile">
                <span className="stat-tile-label">Prix vendu</span>
                <span className="stat-tile-value">{formatCurrency(totals.salePrice)}</span>
              </div>
            </div>
          </div>

          <div className="modal-footer">
            <button type="button" className="btn btn-secondary" onClick={onClose}>
              Annuler
            </button>
            <button type="submit" className="btn" disabled={!canSubmit}>
              {createMutation.isPending ? "Création…" : "Créer la vente"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
