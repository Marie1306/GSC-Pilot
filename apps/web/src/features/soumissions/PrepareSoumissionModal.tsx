import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ApiError } from "../../lib/apiClient.js";
import { computeDetailedSummary, formatCurrency, type BudgetDetail } from "../budgets/api.js";
import { createSoumission, type SoumissionLineInput } from "./api.js";

interface PrepareSoumissionModalProps {
  budget: BudgetDetail;
  onClose: () => void;
}

/**
 * Fenêtre à deux volets demandée explicitement par Marie (13 novembre 2026) :
 * référence du budgétaire en lecture seule (même "Aperçu par catégorie" que
 * BudgetDetail.tsx, via computeDetailedSummary — jamais réimplémenté) pour
 * éviter une erreur de prix, PUIS le contenu éditable de la Soumission —
 * distinct, jamais un reflet automatique ("on ne verra jamais toutes les
 * catégories d'un budgétaire" côté client). Empilés verticalement dans le
 * même modal (plutôt qu'un modal élargi à deux colonnes, jamais vu ailleurs
 * dans l'appli) — les deux restent visibles sans fermer l'un pour voir
 * l'autre, cohérent avec la largeur de modal déjà standard (720px).
 */
export function PrepareSoumissionModal({ budget, onClose }: PrepareSoumissionModalProps) {
  const queryClient = useQueryClient();
  const [introText, setIntroText] = useState("");
  const [termsText, setTermsText] = useState("");
  const [lines, setLines] = useState<SoumissionLineInput[]>([{ label: "", amount: 0 }]);

  const detailedSummary = computeDetailedSummary(budget);

  const createMutation = useMutation({
    mutationFn: () =>
      createSoumission(budget.id, {
        introText: introText.trim() || undefined,
        termsText: termsText.trim() || undefined,
        lines: lines.filter((line) => line.label.trim().length > 0 && line.amount > 0),
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["soumissions", budget.id] });
      onClose();
    },
  });

  function updateLine(index: number, patch: Partial<SoumissionLineInput>) {
    setLines((current) => current.map((line, i) => (i === index ? { ...line, ...patch } : line)));
  }
  function removeLine(index: number) {
    setLines((current) => current.filter((_, i) => i !== index));
  }

  const total = lines.reduce((sum, line) => sum + (Number.isFinite(line.amount) ? line.amount : 0), 0);
  const validLines = lines.filter((line) => line.label.trim().length > 0 && line.amount > 0);
  const canCreate = validLines.length > 0;

  return (
    <div className="modal-backdrop">
      <div className="modal">
        <div className="modal-header">
          <div>
            <h2>Préparer la soumission</h2>
            <p className="modal-subtitle">
              Budgétaire {budget.displayId} — {budget.company ?? budget.contactName}
            </p>
          </div>
          <button type="button" className="modal-close" onClick={onClose} aria-label="Fermer">
            ×
          </button>
        </div>

        <div className="modal-body">
          <div className="card" style={{ background: "var(--gsc-color-surface2)", border: "none", marginBottom: 16 }}>
            <h3 style={{ marginTop: 0 }}>Référence — contenu du budgétaire (lecture seule)</h3>
            <div className="detail-grid">
              <div>
                <span className="detail-label">Grand total — Prix de vente</span>
                <span>
                  <strong>{formatCurrency(budget.totals.totalSale)}</strong>
                </span>
              </div>
              <div>
                <span className="detail-label">Conception & Dessin</span>
                <span>{formatCurrency(detailedSummary.conception.cost)}</span>
              </div>
              <div>
                <span className="detail-label">Fabrication & Assemblage</span>
                <span>{formatCurrency(detailedSummary.fabricationAssemblage.cost)}</span>
              </div>
              <div>
                <span className="detail-label">Panneau & Programmation</span>
                <span>{formatCurrency(detailedSummary.panelProgramming.cost)}</span>
              </div>
              <div>
                <span className="detail-label">Sous-traitance</span>
                <span>{formatCurrency(detailedSummary.subcontracting.cost)}</span>
              </div>
              <div>
                <span className="detail-label">Installation — Heures</span>
                <span>{formatCurrency(detailedSummary.installationLabor.cost)}</span>
              </div>
              <div>
                <span className="detail-label">Installation — Stock et frais divers</span>
                <span>{formatCurrency(detailedSummary.installationStockExpenses.cost)}</span>
              </div>
            </div>
          </div>

          <h3>Contenu de la soumission (ce que le client verra)</h3>
          <div className="form-grid">
            <div className="field field-full">
              <label>Introduction (optionnel)</label>
              <textarea rows={2} value={introText} onChange={(e) => setIntroText(e.target.value)} />
            </div>
          </div>

          <div className="table-scroll">
            <table className="shortlist-table">
              <thead>
                <tr>
                  <th>Libellé</th>
                  <th className="num">Montant</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {lines.map((line, index) => (
                  <tr key={index}>
                    <td>
                      <input
                        type="text"
                        placeholder="Ex. Fabrication et installation du système"
                        value={line.label}
                        onChange={(e) => updateLine(index, { label: e.target.value })}
                      />
                    </td>
                    <td className="num">
                      <input
                        type="number"
                        min={0}
                        step="0.01"
                        value={line.amount || ""}
                        onChange={(e) => updateLine(index, { amount: Number(e.target.value) })}
                      />
                    </td>
                    <td>
                      <button type="button" className="btn btn-secondary btn-small" onClick={() => removeLine(index)} disabled={lines.length === 1}>
                        🗑
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <button type="button" className="btn btn-secondary btn-small" style={{ marginTop: 8 }} onClick={() => setLines((current) => [...current, { label: "", amount: 0 }])}>
            + Ajouter une ligne
          </button>

          <div className="form-grid" style={{ marginTop: 16 }}>
            <div className="field field-full">
              <label>Conditions / validité (optionnel)</label>
              <textarea rows={2} value={termsText} onChange={(e) => setTermsText(e.target.value)} />
            </div>
          </div>

          <div className="budget-total-bar" style={{ marginTop: 16 }}>
            <div>
              <span className="detail-label">Total de la soumission</span>
              <span>
                <strong>{formatCurrency(total)}</strong>
              </span>
            </div>
          </div>

          {createMutation.isError && (
            <p className="form-error" style={{ marginTop: 8 }}>
              {createMutation.error instanceof ApiError ? createMutation.error.message : "Une erreur est survenue — réessayez."}
            </p>
          )}
        </div>

        <div className="modal-footer">
          <button type="button" className="btn btn-secondary" onClick={onClose}>
            Annuler
          </button>
          <button type="button" className="btn" disabled={!canCreate || createMutation.isPending} onClick={() => createMutation.mutate()}>
            {createMutation.isPending ? "Création…" : "Créer la soumission"}
          </button>
        </div>
      </div>
    </div>
  );
}
