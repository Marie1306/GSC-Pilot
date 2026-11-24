import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { externalSaleLineAmount, externalSaleTotals } from "@gsc-pilot/business-rules";
import { ApiError } from "../../lib/apiClient.js";
import { fetchCompanyLetterhead } from "../../lib/companyLetterhead.js";
import { ContactSearchField } from "../contacts/ContactAutocomplete.js";
import type { ContactListItemDto } from "../contacts/api.js";
import { createExternalSaleQuote, fetchNextExternalSaleQuoteNumber, formatCurrency, type ExternalSaleQuoteLineInput } from "./api.js";

interface ExternalSaleQuoteFormProps {
  onClose: () => void;
  onCreated: (id: string) => void;
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

function parsedLines(rows: LineRow[]): ExternalSaleQuoteLineInput[] {
  return rows
    .filter((row) => row.description.trim().length > 0)
    .map((row) => ({ description: row.description.trim(), qty: Number(row.qty) || 0, unitCost: Number(row.unitCost) || 0 }));
}

/**
 * Nouvelle Soumission de Vente externe (23 novembre 2026) — quasi-copie
 * d'ExternalSaleForm.tsx (mêmes champs contact/lignes/frais/marge, mêmes
 * calculs en direct) : la différence est que rien n'est créé de réel ici
 * (ni Contact résolu, ni PurchaseRequest) — seulement la soumission
 * elle-même, modifiable tant qu'elle reste à l'état brouillon
 * (ExternalSaleQuoteDetail.tsx). introText/termsText pré-rempli depuis
 * Settings.soumissionDefaultNote (même champ que la Soumission Projet/
 * Roulement — le texte légal standard de GSC Automation ne dépend pas du
 * mécanisme technique qui le présente), modifiable sans être écrasé par un
 * refetch (même patron que PrepareSoumissionModal.tsx).
 */
export function ExternalSaleQuoteForm({ onClose, onCreated }: ExternalSaleQuoteFormProps) {
  const queryClient = useQueryClient();
  const nextNumberQuery = useQuery({ queryKey: ["external-sale-quotes", "next-number"], queryFn: fetchNextExternalSaleQuoteNumber });
  const letterheadQuery = useQuery({ queryKey: ["company-letterhead"], queryFn: fetchCompanyLetterhead });

  const [contactName, setContactName] = useState("");
  const [company, setCompany] = useState("");
  const [contactRole, setContactRole] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [rows, setRows] = useState<LineRow[]>([emptyLine(0)]);
  const [nextRowKey, setNextRowKey] = useState(1);
  const [transportFee, setTransportFee] = useState("");
  const [adminFee, setAdminFee] = useState("");
  const [marginPct, setMarginPct] = useState<string | null>(null);
  const [introText, setIntroText] = useState("");
  const [termsText, setTermsText] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const effectiveMarginPct = marginPct ?? (nextNumberQuery.data ? String(nextNumberQuery.data.defaultMarginPct) : "20");
  const effectiveTermsText = termsText ?? letterheadQuery.data?.identity.soumissionDefaultNote ?? "";

  const lines = parsedLines(rows);
  const lineAmounts = lines.map((line) => externalSaleLineAmount(line.qty, line.unitCost));
  const totals = externalSaleTotals(lineAmounts, Number(transportFee) || 0, Number(adminFee) || 0, Number(effectiveMarginPct) || 0);

  const createMutation = useMutation({
    mutationFn: () =>
      createExternalSaleQuote({
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
        introText: introText.trim() || undefined,
        termsText: effectiveTermsText.trim() || undefined,
      }),
    onSuccess: ({ id }) => {
      void queryClient.invalidateQueries({ queryKey: ["external-sale-quotes"] });
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
              <h2>Nouvelle soumission</h2>
              <p className="modal-subtitle">Un devis à faire accepter par le client avant de créer la vente pour de bon.</p>
            </div>
            <button type="button" className="modal-close" onClick={onClose} aria-label="Fermer">
              ×
            </button>
          </div>

          <div className="modal-body">
            {error && <p className="form-error">{error}</p>}

            <div className="form-grid">
              <ContactSearchField id="dv-contactName" label="Nom du contact" field="name" value={contactName} onChange={setContactName} onSelect={applyContact} />
              <ContactSearchField id="dv-company" label="Entreprise (facultatif)" field="company" value={company} onChange={setCompany} onSelect={applyContact} />
              <div className="field">
                <label htmlFor="dv-contactRole">Rôle (facultatif)</label>
                <input id="dv-contactRole" value={contactRole} onChange={(e) => setContactRole(e.target.value)} />
              </div>
              <div className="field">
                <label htmlFor="dv-phone">Téléphone (facultatif)</label>
                <input id="dv-phone" value={phone} onChange={(e) => setPhone(e.target.value)} />
              </div>
              <div className="field">
                <label htmlFor="dv-email">Courriel (facultatif)</label>
                <input id="dv-email" value={email} onChange={(e) => setEmail(e.target.value)} />
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
                <label htmlFor="dv-transport">Frais de transport ($, facultatif)</label>
                <input id="dv-transport" type="number" min={0} step="0.01" placeholder="—" value={transportFee} onChange={(e) => setTransportFee(e.target.value)} />
              </div>
              <div className="field">
                <label htmlFor="dv-admin">Frais administratifs ($, facultatif)</label>
                <input id="dv-admin" type="number" min={0} step="0.01" placeholder="—" value={adminFee} onChange={(e) => setAdminFee(e.target.value)} />
              </div>
              <div className="field">
                <label htmlFor="dv-margin">Marge (%)</label>
                <input id="dv-margin" type="number" min={0} max={99.99} step="0.1" value={effectiveMarginPct} onChange={(e) => setMarginPct(e.target.value)} />
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

            <div className="field field-full" style={{ marginTop: 16 }}>
              <label htmlFor="dv-intro">Texte d'introduction (facultatif)</label>
              <textarea id="dv-intro" rows={3} value={introText} onChange={(e) => setIntroText(e.target.value)} />
            </div>
            <div className="field field-full" style={{ marginTop: 10 }}>
              <label htmlFor="dv-terms">Conditions (facultatif)</label>
              <textarea id="dv-terms" rows={3} value={effectiveTermsText} onChange={(e) => setTermsText(e.target.value)} />
            </div>
          </div>

          <div className="modal-footer">
            <button type="button" className="btn btn-secondary" onClick={onClose}>
              Annuler
            </button>
            <button type="submit" className="btn" disabled={!canSubmit}>
              {createMutation.isPending ? "Création…" : "Créer la soumission"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
