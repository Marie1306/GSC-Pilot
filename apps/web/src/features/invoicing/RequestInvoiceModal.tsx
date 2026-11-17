import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { ApiError } from "../../lib/apiClient.js";
import { formatCurrency, type InvoiceRequestPreviewDto, type InvoiceRequestLineInput } from "../projects/api.js";

interface RequestInvoiceModalProps {
  subtitle: string;
  fetchPreview: () => Promise<{ preview: InvoiceRequestPreviewDto }>;
  confirm: (note?: string, lines?: InvoiceRequestLineInput[]) => Promise<unknown>;
  onClose: () => void;
  onSuccess: () => void;
  /**
   * Éditeur de lignes (17 novembre 2026, demande explicite) — Description/
   * Qté/Prix unitaire, pré-rempli automatiquement quand une source existe
   * (Confirmation de commande pour Projet/Roulement, lignes de pièces pour
   * Vente externe) mais toujours éditable par-dessus ("les deux options
   * partout", confirmé). Explicitement DÉSACTIVÉ pour Call de service
   * (SelectBonsDeTravailModal.tsx) — garde sa propre ventilation par Bon de
   * travail, déjà réelle et détaillée, jamais remplacée par un éditeur
   * générique. Un prop requis (jamais de valeur par défaut devinée) pour
   * que chaque appelant déclare explicitement son choix.
   */
  allowLines: boolean;
}

function formatDueDate(iso: string): string {
  return new Date(iso).toLocaleDateString("fr-CA", { year: "numeric", month: "short", day: "numeric" });
}

function round2(value: number): number {
  return Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100;
}

/**
 * Geste unifié "Demander la facturation" (13 novembre 2026, refonte) —
 * aperçu (numéro/%, taxes, échéance net-30) puis confirmation dans la même
 * fenêtre. Réutilisée par Project/Rolling/ServiceCall/ExternalSale, chacun
 * fournissant son propre fetchPreview/confirm (route différente selon que
 * le jalon existe déjà — voir ProjectInvoicePlan/RollingDetail — ou doit
 * être créé par le même geste — ServiceCallDetail/ExternalSaleDetail).
 * Remplace l'ancien bouton "Demander" + la saisie manuelle du numéro
 * (ex-"Enregistrer", InvoiceDetailDrawer.tsx) : numéro réel attribué
 * seulement à la confirmation, jamais avant.
 */
export function RequestInvoiceModal({ subtitle, fetchPreview, confirm, onClose, onSuccess, allowLines }: RequestInvoiceModalProps) {
  const [note, setNote] = useState("");
  const [lines, setLines] = useState<InvoiceRequestLineInput[]>([]);
  const [error, setError] = useState<string | null>(null);
  const previewQuery = useQuery({ queryKey: ["invoice-request-preview", subtitle], queryFn: fetchPreview });

  const preview = previewQuery.data?.preview;

  // Pré-remplissage des lignes depuis la suggestion du serveur — une seule
  // fois, à l'arrivée de l'aperçu (jamais réinitialisé ensuite, même si
  // React Query refetch en arrière-plan). Ajustement pendant le rendu
  // plutôt qu'un effect (recommandation React : éviter setState synchrone
  // dans un effect — même patron que ProjectAmendments.tsx).
  const [lastPreview, setLastPreview] = useState(preview);
  if (preview !== lastPreview) {
    setLastPreview(preview);
    if (allowLines && preview) {
      setLines(preview.suggestedLines?.map((line) => ({ description: line.description, qty: line.quantity, unitPrice: line.unitPrice })) ?? []);
    }
  }

  const confirmMutation = useMutation({
    mutationFn: () => confirm(note.trim() || undefined, allowLines && lines.length > 0 ? lines : undefined),
    onSuccess: () => {
      onSuccess();
      onClose();
    },
    onError: (err: unknown) => setError(err instanceof ApiError ? err.message : "Une erreur est survenue — réessayez."),
  });

  function updateLine(index: number, patch: Partial<InvoiceRequestLineInput>) {
    setLines((current) => current.map((line, i) => (i === index ? { ...line, ...patch } : line)));
  }
  function removeLine(index: number) {
    setLines((current) => current.filter((_, i) => i !== index));
  }

  const linesTotal = round2(lines.reduce((sum, line) => sum + Number(line.qty || 0) * Number(line.unitPrice || 0), 0));
  const target = preview ? round2(preview.amountBeforeTax) : 0;
  // Un cent de tolérance — même limite acceptée que la ventilation
  // Confirmation de commande (arrondi par ligne).
  const linesBalanced = lines.length === 0 || Math.abs(linesTotal - target) <= 0.01;
  const canConfirm = !!preview && linesBalanced && !confirmMutation.isPending;

  return (
    <div className="modal-backdrop">
      <div className="modal" onClick={(event) => event.stopPropagation()}>
        <div className="modal-header">
          <div>
            <h2>Demander la facturation</h2>
            <p className="modal-subtitle">{subtitle}</p>
          </div>
          <button type="button" className="modal-close" onClick={onClose} aria-label="Fermer">
            ×
          </button>
        </div>
        <div className="modal-body">
          {previewQuery.isLoading && <p style={{ color: "var(--gsc-color-muted)", fontSize: 13 }}>Chargement…</p>}
          {previewQuery.isError && (
            <p className="form-error">
              {previewQuery.error instanceof ApiError ? previewQuery.error.message : "Impossible de calculer l'aperçu."}
            </p>
          )}
          {preview && (
            <>
              <div className="stat-tile-grid" style={{ marginBottom: 16 }}>
                <div className="stat-tile">
                  <span className="stat-tile-label">Numéro</span>
                  <span className="stat-tile-value">{preview.nextInvoiceNumber}</span>
                </div>
                <div className="stat-tile">
                  <span className="stat-tile-label">Avant taxes</span>
                  <span className="stat-tile-value">{formatCurrency(preview.amountBeforeTax)}</span>
                </div>
                <div className="stat-tile">
                  <span className="stat-tile-label">TPS</span>
                  <span className="stat-tile-value">{formatCurrency(preview.tpsAmount)}</span>
                </div>
                <div className="stat-tile">
                  <span className="stat-tile-label">TVQ</span>
                  <span className="stat-tile-value">{formatCurrency(preview.tvqAmount)}</span>
                </div>
                <div className="stat-tile">
                  <span className="stat-tile-label">Total avec taxes</span>
                  <span className="stat-tile-value">{formatCurrency(preview.totalWithTax)}</span>
                </div>
                <div className="stat-tile">
                  <span className="stat-tile-label">Échéance (net 30)</span>
                  <span className="stat-tile-value">{formatDueDate(preview.dueDate)}</span>
                </div>
              </div>

              {allowLines && (
                <>
                  <h3 style={{ fontSize: 15, margin: "4px 0 8px" }}>Lignes de la facture</h3>
                  <p className="modal-subtitle" style={{ marginTop: 0 }}>
                    Pré-remplies automatiquement quand possible — modifiables, ou videz-les pour revenir à l'affichage générique.
                  </p>
                  {lines.length > 0 && (
                    <div className="table-scroll">
                      <table className="shortlist-table">
                        <thead>
                          <tr>
                            <th className="num" style={{ width: 70 }}>
                              Qté
                            </th>
                            <th>Description</th>
                            <th className="num">Prix unitaire</th>
                            <th className="num">Montant</th>
                            <th></th>
                          </tr>
                        </thead>
                        <tbody>
                          {lines.map((line, index) => (
                            <tr key={index}>
                              <td className="num">
                                <input
                                  type="number"
                                  min={0}
                                  step="0.01"
                                  value={line.qty || ""}
                                  onChange={(e) => updateLine(index, { qty: Number(e.target.value) })}
                                />
                              </td>
                              <td>
                                <input
                                  type="text"
                                  style={{ width: "100%" }}
                                  value={line.description}
                                  onChange={(e) => updateLine(index, { description: e.target.value })}
                                />
                              </td>
                              <td className="num">
                                <input
                                  type="number"
                                  step="0.01"
                                  value={line.unitPrice || ""}
                                  onChange={(e) => updateLine(index, { unitPrice: Number(e.target.value) })}
                                />
                              </td>
                              <td className="num">{formatCurrency(round2(Number(line.qty || 0) * Number(line.unitPrice || 0)))}</td>
                              <td>
                                <button type="button" className="btn btn-secondary btn-small" onClick={() => removeLine(index)}>
                                  🗑
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                  <button
                    type="button"
                    className="btn btn-secondary btn-small"
                    style={{ marginTop: 8 }}
                    onClick={() => setLines((current) => [...current, { description: "", qty: 1, unitPrice: 0 }])}
                  >
                    + Ajouter une ligne
                  </button>
                  {lines.length > 0 && (
                    <p className={linesBalanced ? "modal-subtitle" : "form-error"} style={{ marginTop: 10 }}>
                      Total des lignes : {formatCurrency(linesTotal)} — cible : {formatCurrency(target)}
                      {!linesBalanced && " (doit correspondre au montant avant taxes du jalon)"}
                    </p>
                  )}
                </>
              )}

              <div className="field field-full" style={{ marginTop: 16 }}>
                <label htmlFor="invoice-request-note">Note (facultatif)</label>
                <textarea id="invoice-request-note" rows={2} value={note} onChange={(event) => setNote(event.target.value)} />
              </div>
            </>
          )}
          {error && <p className="form-error">{error}</p>}
        </div>
        <div className="modal-footer">
          <button type="button" className="btn" disabled={!canConfirm} onClick={() => confirmMutation.mutate()}>
            {confirmMutation.isPending ? "…" : "Demander la facturation"}
          </button>
          <button type="button" className="btn btn-secondary" onClick={onClose}>
            Annuler
          </button>
        </div>
      </div>
    </div>
  );
}
