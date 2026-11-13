import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ApiError } from "../../lib/apiClient.js";
import { saveTreasurySettings, type TreasurySettingsDto } from "./api.js";

const EMPTY: TreasurySettingsDto = {
  checkingOpeningBalance: 0,
  checkingOpeningDate: new Date().toISOString().slice(0, 10),
  locOpeningBalance: 0,
  locOpeningDate: new Date().toISOString().slice(0, 10),
  sweepThreshold: 20000,
  locCreditLimit: 200000,
};

/**
 * Soldes d'ouverture + seuil de bascule (13 novembre 2026) — première
 * configuration (table TreasurySettings neuve, jamais seedée) OU correction
 * ponctuelle plus tard. Tant qu'aucune ligne n'existe, le tableau
 * prévisionnel refuse de se charger (voir TreasuryPage.tsx) — ce formulaire
 * est donc le premier écran que Marie voit en ouvrant la Trésorerie.
 */
export function TreasurySettingsCard({ settings }: { settings: TreasurySettingsDto | null }) {
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState<TreasurySettingsDto>(settings ?? EMPTY);
  const [error, setError] = useState<string | null>(null);

  const saveMutation = useMutation({
    mutationFn: () => saveTreasurySettings(draft),
    onSuccess: () => {
      setError(null);
      void queryClient.invalidateQueries({ queryKey: ["treasury"] });
    },
    onError: (err: unknown) => setError(err instanceof ApiError ? err.message : "Une erreur est survenue — réessayez."),
  });

  function set<K extends keyof TreasurySettingsDto>(key: K, value: TreasurySettingsDto[K]) {
    setDraft((current) => ({ ...current, [key]: value }));
  }

  return (
    <div className="card" style={{ marginTop: settings ? 20 : 0 }}>
      <div className="card-band-header">
        <div>
          <h3>Soldes d'ouverture</h3>
          <p className="modal-subtitle">
            Point de départ du prévisionnel — le solde du compte chèque et le montant dû sur la marge de crédit à la date choisie.
          </p>
        </div>
      </div>

      {error && <p className="form-error">{error}</p>}

      <div className="form-grid">
        <div className="field">
          <label>Solde du compte chèque ($)</label>
          <input type="number" step="0.01" value={draft.checkingOpeningBalance} onChange={(e) => set("checkingOpeningBalance", Number(e.target.value))} />
        </div>
        <div className="field">
          <label>À la date du</label>
          <input type="date" value={draft.checkingOpeningDate} onChange={(e) => set("checkingOpeningDate", e.target.value)} />
        </div>
        <div className="field">
          <label>Montant dû sur la marge de crédit ($)</label>
          <input type="number" min={0} step="0.01" value={draft.locOpeningBalance} onChange={(e) => set("locOpeningBalance", Number(e.target.value))} />
        </div>
        <div className="field">
          <label>À la date du</label>
          <input type="date" value={draft.locOpeningDate} onChange={(e) => set("locOpeningDate", e.target.value)} />
        </div>
        <div className="field">
          <label>Seuil de bascule ($)</label>
          <input type="number" min={1} step="0.01" value={draft.sweepThreshold} onChange={(e) => set("sweepThreshold", Number(e.target.value))} />
        </div>
        <div className="field">
          <label>Plafond de la marge de crédit ($)</label>
          <input type="number" min={1} step="0.01" value={draft.locCreditLimit} onChange={(e) => set("locCreditLimit", Number(e.target.value))} />
        </div>
      </div>

      <button type="button" className="btn" disabled={saveMutation.isPending} onClick={() => saveMutation.mutate()}>
        {saveMutation.isPending ? "…" : "Enregistrer les soldes d'ouverture"}
      </button>
    </div>
  );
}
