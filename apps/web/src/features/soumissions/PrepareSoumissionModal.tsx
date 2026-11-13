import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ApiError } from "../../lib/apiClient.js";
import { fetchCompanyLetterhead } from "../../lib/companyLetterhead.js";
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
 *
 * Lignes en quantité × prix unitaire (14 novembre 2026, confirmé avec de
 * vraies soumissions — ex. "1x 1 000$"), libellé en texte libre
 * multi-paragraphe (une soumission est parfois ventilée en plusieurs lignes :
 * conception, fabrication, installation, options...). Le champ Conditions
 * est pré-rempli automatiquement avec la note légale standard (Paramètres,
 * CompanyIdentityCard.tsx) à l'ouverture — modifiable au cas par cas, jamais
 * imposée.
 */
export function PrepareSoumissionModal({ budget, onClose }: PrepareSoumissionModalProps) {
  const queryClient = useQueryClient();
  const [introText, setIntroText] = useState("");
  const [termsText, setTermsText] = useState<string | null>(null);
  const [lines, setLines] = useState<SoumissionLineInput[]>([{ label: "", qty: 1, unitPrice: 0 }]);

  // Même patron que CompanyIdentityCard/MarginThresholdsCard (draftFor) :
  // termsText reste nul tant que Marie n'a rien tapé, l'affichage retombe
  // sur la note par défaut lue en direct — jamais un useEffect qui copie la
  // donnée serveur dans le state au chargement (cascading renders inutiles).
  const letterheadQuery = useQuery({ queryKey: ["company-letterhead"], queryFn: fetchCompanyLetterhead });
  const effectiveTermsText = termsText ?? letterheadQuery.data?.identity.soumissionDefaultNote ?? "";

  const detailedSummary = computeDetailedSummary(budget);

  const createMutation = useMutation({
    mutationFn: () =>
      createSoumission(budget.id, {
        introText: introText.trim() || undefined,
        termsText: effectiveTermsText.trim() || undefined,
        lines: lines.filter((line) => line.label.trim().length > 0 && line.qty > 0 && line.unitPrice > 0),
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

  const validLines = lines.filter((line) => line.label.trim().length > 0 && line.qty > 0 && line.unitPrice > 0);
  const total = validLines.reduce((sum, line) => sum + line.qty * line.unitPrice, 0);
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
                  <th>Description</th>
                  <th className="num">Qté</th>
                  <th className="num">Prix unitaire</th>
                  <th className="num">Montant</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {lines.map((line, index) => (
                  <tr key={index}>
                    <td>
                      <textarea
                        rows={2}
                        style={{ width: "100%" }}
                        placeholder="Ex. Conception et fabrication de 5 portes pour chutes à buanderies, avec panneau de contrôle..."
                        value={line.label}
                        onChange={(e) => updateLine(index, { label: e.target.value })}
                      />
                    </td>
                    <td className="num">
                      <input type="number" min={0} step="0.01" value={line.qty || ""} onChange={(e) => updateLine(index, { qty: Number(e.target.value) })} />
                    </td>
                    <td className="num">
                      <input
                        type="number"
                        min={0}
                        step="0.01"
                        value={line.unitPrice || ""}
                        onChange={(e) => updateLine(index, { unitPrice: Number(e.target.value) })}
                      />
                    </td>
                    <td className="num">{formatCurrency((line.qty || 0) * (line.unitPrice || 0))}</td>
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
          <button
            type="button"
            className="btn btn-secondary btn-small"
            style={{ marginTop: 8 }}
            onClick={() => setLines((current) => [...current, { label: "", qty: 1, unitPrice: 0 }])}
          >
            + Ajouter une ligne
          </button>

          <div className="form-grid" style={{ marginTop: 16 }}>
            <div className="field field-full">
              <label>Conditions (pré-remplies depuis Paramètres, modifiable pour cette soumission)</label>
              <textarea rows={4} value={effectiveTermsText} onChange={(e) => setTermsText(e.target.value)} />
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
