import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { fetchManualEntries, createManualEntry, deleteManualEntry, formatCurrency } from "./api.js";

function formatDate(iso: string): string {
  return new Date(`${iso}T00:00:00`).toLocaleDateString("fr-CA", { year: "numeric", month: "short", day: "numeric" });
}

/** Entrées ponctuelles (jamais récurrentes) — montant signé : négatif = sortie, positif = entrée. */
export function ManualEntriesCard() {
  const queryClient = useQueryClient();
  const entriesQuery = useQuery({ queryKey: ["treasury", "manual-entries"], queryFn: fetchManualEntries });
  const [label, setLabel] = useState("");
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));

  const invalidate = () => void queryClient.invalidateQueries({ queryKey: ["treasury"] });
  const createMutation = useMutation({
    mutationFn: () => createManualEntry({ label: label.trim(), amount: Number(amount), date }),
    onSuccess: () => {
      setLabel("");
      setAmount("");
      invalidate();
    },
  });
  const deleteMutation = useMutation({ mutationFn: deleteManualEntry, onSuccess: invalidate });

  const entries = entriesQuery.data?.entries ?? [];
  const canCreate = label.trim().length > 0 && amount.trim().length > 0 && Number(amount) !== 0;

  return (
    <div className="card" style={{ marginTop: 20 }}>
      <div className="card-band-header">
        <div>
          <h3>Entrées ponctuelles</h3>
          <p className="modal-subtitle">Mouvements hors cycle normal — jamais récurrents.</p>
        </div>
      </div>

      <div className="table-scroll">
        <table className="shortlist-table">
          <thead>
            <tr>
              <th>Libellé</th>
              <th>Date</th>
              <th className="num">Montant</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {entries.map((entry) => (
              <tr key={entry.id}>
                <td>{entry.label}</td>
                <td>{formatDate(entry.date)}</td>
                <td className={`num ${entry.amount < 0 ? "over-budget" : ""}`}>{formatCurrency(entry.amount)}</td>
                <td>
                  <button type="button" className="btn btn-secondary btn-small" onClick={() => deleteMutation.mutate(entry.id)}>
                    🗑
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div style={{ display: "flex", gap: 8, marginTop: 14, alignItems: "center", flexWrap: "wrap" }}>
        <input type="text" placeholder="Libellé" style={{ maxWidth: 200 }} value={label} onChange={(e) => setLabel(e.target.value)} />
        <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        <input
          type="number"
          step="0.01"
          placeholder="Montant ($, négatif = sortie)"
          style={{ maxWidth: 200 }}
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
        />
        <button type="button" className="btn" disabled={!canCreate || createMutation.isPending} onClick={() => createMutation.mutate()}>
          + Ajouter
        </button>
      </div>
    </div>
  );
}
