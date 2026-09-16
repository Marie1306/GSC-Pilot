import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { formatCurrency } from "../projects/api.js";
import { createSeaoCompetitor, deleteSeaoCompetitor, type SeaoCompetitorDto } from "./api.js";

interface SeaoCompetitorsProps {
  seaoFileId: string;
  competitors: SeaoCompetitorDto[];
}

export function SeaoCompetitors({ seaoFileId, competitors }: SeaoCompetitorsProps) {
  const queryClient = useQueryClient();
  const [companyName, setCompanyName] = useState("");
  const [submittedPrice, setSubmittedPrice] = useState("");

  const invalidate = () => void queryClient.invalidateQueries({ queryKey: ["seao-file", seaoFileId] });
  const createMutation = useMutation({
    mutationFn: () => createSeaoCompetitor(seaoFileId, companyName.trim(), Number(submittedPrice) || 0),
    onSuccess: () => {
      setCompanyName("");
      setSubmittedPrice("");
      invalidate();
    },
  });
  const deleteMutation = useMutation({ mutationFn: deleteSeaoCompetitor, onSuccess: invalidate });

  return (
    <div style={{ marginBottom: 20 }}>
      <h3 style={{ fontSize: 15, marginBottom: 4 }}>Concurrents</h3>
      {competitors.length === 0 && <p className="empty-hint">Aucun concurrent enregistré.</p>}
      {competitors.length > 0 && (
        <div className="table-scroll">
          <table className="shortlist-table">
            <thead>
              <tr>
                <th>Entreprise</th>
                <th className="num">Prix soumis</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {competitors.map((c) => (
                <tr key={c.id}>
                  <td>{c.companyName}</td>
                  <td className="num">{formatCurrency(c.submittedPrice)}</td>
                  <td>
                    <button type="button" className="btn btn-secondary btn-small" onClick={() => deleteMutation.mutate(c.id)}>
                      ×
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <div style={{ display: "flex", gap: 8, marginTop: 10, flexWrap: "wrap" }}>
        <input placeholder="Nom de l'entreprise" value={companyName} onChange={(e) => setCompanyName(e.target.value)} style={{ flex: 1, minWidth: 160 }} />
        <input type="number" min={0} step="0.01" placeholder="Prix soumis" value={submittedPrice} onChange={(e) => setSubmittedPrice(e.target.value)} style={{ maxWidth: 140 }} />
        <button type="button" className="btn btn-small" disabled={!companyName.trim() || createMutation.isPending} onClick={() => createMutation.mutate()}>
          Ajouter
        </button>
      </div>
    </div>
  );
}
