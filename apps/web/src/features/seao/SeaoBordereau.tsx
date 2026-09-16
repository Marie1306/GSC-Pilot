import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { seaoBordereauLineSalePrice, seaoBordereauTotal } from "@gsc-pilot/business-rules";
import { formatCurrency } from "../projects/api.js";
import { createSeaoBordereauLine, updateSeaoBordereauLine, deleteSeaoBordereauLine, type SeaoBordereauLineDto } from "./api.js";

interface SeaoBordereauProps {
  seaoFileId: string;
  lines: SeaoBordereauLineDto[];
}

/**
 * Bordereau de soumission (16 septembre 2026) — description suggérée par
 * l'IA à la première analyse (source "ai", jamais réécrite après coup),
 * coût/marge/prix toujours saisis par un humain (voir SeaoBordereauLine,
 * l'IA n'a jamais accès à un champ de prix). Prix recalculé et enregistré
 * côté serveur à chaque écriture — l'aperçu local n'est qu'un affichage.
 */
export function SeaoBordereau({ seaoFileId, lines }: SeaoBordereauProps) {
  const queryClient = useQueryClient();
  const [newDescription, setNewDescription] = useState("");
  const [newCost, setNewCost] = useState("");
  const [newMarginPct, setNewMarginPct] = useState("20");

  const invalidate = () => void queryClient.invalidateQueries({ queryKey: ["seao-file", seaoFileId] });

  const createMutation = useMutation({
    mutationFn: () => createSeaoBordereauLine(seaoFileId, { description: newDescription.trim(), cost: Number(newCost) || 0, marginPct: Number(newMarginPct) || 0 }),
    onSuccess: () => {
      setNewDescription("");
      setNewCost("");
      invalidate();
    },
  });
  const updateMutation = useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: { cost?: number; marginPct?: number; description?: string } }) => updateSeaoBordereauLine(id, patch),
    onSuccess: invalidate,
  });
  const deleteMutation = useMutation({ mutationFn: deleteSeaoBordereauLine, onSuccess: invalidate });

  const total = seaoBordereauTotal(lines.map((line) => line.salePrice));

  return (
    <div style={{ marginBottom: 20 }}>
      <h3 style={{ fontSize: 15, marginBottom: 4 }}>Bordereau de soumission</h3>
      <div className="table-scroll">
        <table className="shortlist-table">
          <thead>
            <tr>
              <th>Description</th>
              <th className="num">Coût</th>
              <th className="num">Marge (%)</th>
              <th className="num">Prix de vente</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {lines.map((line) => (
              <tr key={line.id}>
                <td>
                  <input
                    defaultValue={line.description}
                    onBlur={(e) => e.target.value.trim() !== line.description && updateMutation.mutate({ id: line.id, patch: { description: e.target.value.trim() } })}
                  />
                  {line.source === "ai" && <div className="cell-sub">Suggéré par l'IA</div>}
                </td>
                <td>
                  <input
                    type="number"
                    min={0}
                    step="0.01"
                    defaultValue={line.cost}
                    onBlur={(e) => {
                      const value = Number(e.target.value) || 0;
                      if (value !== line.cost) updateMutation.mutate({ id: line.id, patch: { cost: value } });
                    }}
                  />
                </td>
                <td>
                  <input
                    type="number"
                    min={0}
                    max={99.99}
                    step="0.1"
                    defaultValue={line.marginPct}
                    onBlur={(e) => {
                      const value = Number(e.target.value) || 0;
                      if (value !== line.marginPct) updateMutation.mutate({ id: line.id, patch: { marginPct: value } });
                    }}
                  />
                </td>
                <td className="num">{formatCurrency(line.salePrice)}</td>
                <td>
                  <button type="button" className="btn btn-secondary btn-small" onClick={() => deleteMutation.mutate(line.id)}>
                    ×
                  </button>
                </td>
              </tr>
            ))}
            <tr>
              <td>
                <input placeholder="Nouvelle ligne…" value={newDescription} onChange={(e) => setNewDescription(e.target.value)} />
              </td>
              <td>
                <input type="number" min={0} step="0.01" placeholder="0" value={newCost} onChange={(e) => setNewCost(e.target.value)} />
              </td>
              <td>
                <input type="number" min={0} max={99.99} step="0.1" value={newMarginPct} onChange={(e) => setNewMarginPct(e.target.value)} />
              </td>
              <td className="num">{formatCurrency(seaoBordereauLineSalePrice(Number(newCost) || 0, Number(newMarginPct) || 0))}</td>
              <td>
                <button type="button" className="btn btn-small" disabled={!newDescription.trim() || createMutation.isPending} onClick={() => createMutation.mutate()}>
                  +
                </button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <p style={{ textAlign: "right", fontWeight: 600, marginTop: 8 }}>Total : {formatCurrency(total)}</p>
    </div>
  );
}
