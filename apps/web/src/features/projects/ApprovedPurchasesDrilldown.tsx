import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { fetchApprovedPurchaseEntries, formatCurrency } from "./api.js";

interface ApprovedPurchasesDrilldownProps {
  projectId: string;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("fr-CA", { year: "numeric", month: "short", day: "numeric" });
}

/**
 * Détail des achats approuvés — combine Demande d'achat (appliquée au
 * projet) et Achat direct (ProjectPurchaseEntry approuvé), même source que
 * le total "Achats réels"/"Réel approuvé" (getApprovedPurchaseEntries,
 * projects/service.ts). Partagé entre la vue active du projet
 * (ProjectPurchaseEntries — jusqu'au 27 août 2026, seuls les achats directs
 * saisis ici étaient visibles, les demandes d'achat appliquées restaient
 * invisibles malgré leur montant déjà compté dans ACHATS RÉELS, rapporté
 * par l'utilisatrice) et le Post-mortem — un seul rendu à maintenir.
 */
export function ApprovedPurchasesDrilldown({ projectId }: ApprovedPurchasesDrilldownProps) {
  const [show, setShow] = useState(false);
  const query = useQuery({
    queryKey: ["approved-purchases", projectId],
    queryFn: () => fetchApprovedPurchaseEntries(projectId),
    enabled: show,
  });

  return (
    <div>
      <button type="button" className="btn btn-secondary btn-small" onClick={() => setShow((v) => !v)}>
        🛒 {show ? "Masquer le détail des achats" : "Voir tous les achats approuvés"}
      </button>
      {show && (
        <div style={{ overflowX: "auto", marginTop: 10 }}>
          {query.isLoading && <p style={{ fontSize: 13, color: "var(--gsc-color-muted)" }}>Chargement…</p>}
          {query.data && query.data.entries.length === 0 && (
            <p style={{ fontSize: 13, color: "var(--gsc-color-muted)" }}>Aucun achat approuvé.</p>
          )}
          {query.data && query.data.entries.length > 0 && (
            <table className="shortlist-table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Source</th>
                  <th>Catégorie</th>
                  <th>Description / fournisseur</th>
                  {query.data.entries[0]?.amount !== undefined && <th className="num">Montant</th>}
                </tr>
              </thead>
              <tbody>
                {query.data.entries.map((entry) => (
                  <tr key={entry.id}>
                    <td>{formatDate(entry.date)}</td>
                    <td>{entry.source}</td>
                    <td>{entry.category}</td>
                    <td>
                      {entry.description}
                      {entry.supplier && <div className="cell-sub">{entry.supplier}</div>}
                    </td>
                    {entry.amount !== undefined && <td className="num">{formatCurrency(entry.amount)}</td>}
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  );
}
