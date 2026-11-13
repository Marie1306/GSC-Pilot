import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { fetchPendingForecastEntries, setForecastDate, formatCurrency, type PendingForecastEntryDto } from "./api.js";

function DateCell({ entry, onSaved }: { entry: PendingForecastEntryDto; onSaved: () => void }) {
  const [draft, setDraft] = useState(entry.effectiveDate ?? "");
  const mutation = useMutation({
    mutationFn: (value: string | null) => setForecastDate(entry.id, value),
    onSuccess: onSaved,
  });

  return (
    <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
      <input
        type="date"
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={() => {
          if (draft !== (entry.effectiveDate ?? "")) mutation.mutate(draft || null);
        }}
      />
      {entry.isManualDate && (
        <button
          type="button"
          className="link-button"
          onClick={() => {
            setDraft("");
            mutation.mutate(null);
          }}
        >
          retirer
        </button>
      )}
    </div>
  );
}

/**
 * Prévisionnel — jalons pas encore facturés (demande ajoutée en cours de
 * route, 13 novembre 2026) : voir l'argent pas encore facturé, distinct du
 * "concret" (facture réellement envoyée). Ordre de priorité confirmé par
 * Marie pour la date : forecastDate manuelle (fixée ici même) > date de
 * livraison prévue du dossier parent > "non daté" — jamais une semaine
 * devinée au hasard pour ce dernier cas. Elle a explicitement demandé à
 * pouvoir fixer la date directement depuis la Trésorerie, sans naviguer
 * projet par projet — chaque ligne a donc son propre champ de date éditable.
 */
export function PendingForecastCard() {
  const queryClient = useQueryClient();
  const pendingQuery = useQuery({ queryKey: ["treasury", "pending-entries"], queryFn: fetchPendingForecastEntries });
  const entries = pendingQuery.data?.entries ?? [];
  const dated = entries.filter((e) => e.effectiveDate !== null).sort((a, b) => (a.effectiveDate ?? "").localeCompare(b.effectiveDate ?? ""));
  const undated = entries.filter((e) => e.effectiveDate === null);
  const undatedTotal = undated.reduce((sum, e) => sum + e.amount, 0);

  const invalidate = () => void queryClient.invalidateQueries({ queryKey: ["treasury", "pending-entries"] });

  return (
    <div className="card" style={{ marginTop: 20 }}>
      <div className="card-band-header">
        <div>
          <h3>Jalons en attente de facturation</h3>
          <p className="modal-subtitle">
            Pas encore de facture réelle — la date vient de la livraison prévue du dossier quand elle existe, ou se fixe ici manuellement.
          </p>
        </div>
      </div>

      {entries.length === 0 ? (
        <p style={{ color: "var(--gsc-color-muted)", fontSize: 13 }}>{pendingQuery.isLoading ? "Chargement…" : "Rien en attente."}</p>
      ) : (
        <>
          <div className="table-scroll">
            <table className="shortlist-table">
              <thead>
                <tr>
                  <th>Dossier</th>
                  <th>Client</th>
                  <th className="num">Montant</th>
                  <th>Date prévue</th>
                </tr>
              </thead>
              <tbody>
                {dated.map((entry) => (
                  <tr key={entry.id}>
                    <td>{entry.sourceLabel}</td>
                    <td>{entry.clientLabel}</td>
                    <td className="num">{formatCurrency(entry.amount)}</td>
                    <td>
                      <DateCell entry={entry} onSaved={invalidate} />
                    </td>
                  </tr>
                ))}
                {undated.map((entry) => (
                  <tr key={entry.id}>
                    <td>{entry.sourceLabel}</td>
                    <td>{entry.clientLabel}</td>
                    <td className="num">{formatCurrency(entry.amount)}</td>
                    <td>
                      <DateCell entry={entry} onSaved={invalidate} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {undated.length > 0 && (
            <p style={{ marginTop: 12, fontSize: 13, color: "var(--gsc-color-muted)" }}>
              Total non daté (pas encore placé dans le prévisionnel) : <strong>{formatCurrency(undatedTotal)}</strong> sur {undated.length}{" "}
              {undated.length === 1 ? "jalon" : "jalons"} — fixe une date ci-dessus pour l'inclure dans le tableau.
            </p>
          )}
        </>
      )}
    </div>
  );
}
