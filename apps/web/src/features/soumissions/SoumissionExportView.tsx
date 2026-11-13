import { useEffect } from "react";
import { useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { CompanyLetterhead } from "../../components/CompanyLetterhead.js";
import { fetchSoumissionDetail, formatCurrency, SOUMISSION_STATUS_LABELS } from "./api.js";

function formatDate(iso: string | null): string {
  return iso ? new Date(iso).toLocaleDateString("fr-CA", { year: "numeric", month: "long", day: "numeric" }) : "—";
}

/**
 * Vue d'export PDF d'une Soumission (13 novembre 2026) — même mécanisme que
 * BudgetExportView.tsx/DeliveryExportView.tsx : route autonome, window.print(),
 * aucun chiffre recalculé (fetchSoumissionDetail, même fonction que
 * SoumissionCard.tsx). Seuls les montants gelés à l'envoi (amountBeforeTax/
 * tpsAmount/tvqAmount/totalWithTax, tous null pour un brouillon — voir
 * SoumissionCard.tsx, le bouton Imprimer n'apparaît qu'une fois envoyée) sont
 * affichés, jamais une somme recalculée en direct des lignes.
 */
export function SoumissionExportView() {
  const { id } = useParams<{ id: string }>();
  const detailQuery = useQuery({
    queryKey: ["soumission", id],
    queryFn: () => fetchSoumissionDetail(id!),
    enabled: !!id,
  });
  const soumission = detailQuery.data?.soumission;

  useEffect(() => {
    if (!soumission) return;
    const timer = setTimeout(() => window.print(), 400);
    return () => clearTimeout(timer);
  }, [soumission]);

  if (!id) return null;
  if (!soumission) return <div style={{ padding: 40 }}>{detailQuery.isError ? "Soumission introuvable." : "Chargement…"}</div>;

  return (
    <div className="pdf-export">
      <button type="button" className="btn no-print" style={{ margin: 20 }} onClick={() => window.print()}>
        🖨️ Imprimer / Enregistrer en PDF
      </button>

      <div className="pdf-export-page">
        <header className="pdf-export-header">
          <CompanyLetterhead />
          <div className="pdf-export-status">{SOUMISSION_STATUS_LABELS[soumission.status]}</div>
        </header>

        <div className="pdf-export-notes">
          <strong>Soumission {soumission.displayId}</strong>
          <p>
            <strong>Client :</strong> {soumission.company ?? soumission.contactName ?? "—"}
            {soumission.company && soumission.contactName ? ` (${soumission.contactName})` : ""}
          </p>
          <p>
            <strong>Référence budgétaire :</strong> {soumission.budgetDisplayId} &nbsp; <strong>Date :</strong> {formatDate(soumission.sentAt)}
          </p>
        </div>

        {soumission.introText && (
          <section className="pdf-export-section">
            <p style={{ whiteSpace: "pre-wrap" }}>{soumission.introText}</p>
          </section>
        )}

        <section className="pdf-export-section">
          <h2>Détail</h2>
          <table>
            <thead>
              <tr>
                <th>Description</th>
                <th className="num">Montant</th>
              </tr>
            </thead>
            <tbody>
              {soumission.lines.map((line) => (
                <tr key={line.id}>
                  <td>{line.label}</td>
                  <td className="num">{formatCurrency(line.amount)}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <table style={{ marginTop: 12 }}>
            <tbody>
              <tr>
                <td>Sous-total</td>
                <td className="num">{soumission.amountBeforeTax !== null ? formatCurrency(soumission.amountBeforeTax) : "—"}</td>
              </tr>
              <tr>
                <td>TPS</td>
                <td className="num">{soumission.tpsAmount !== null ? formatCurrency(soumission.tpsAmount) : "—"}</td>
              </tr>
              <tr>
                <td>TVQ</td>
                <td className="num">{soumission.tvqAmount !== null ? formatCurrency(soumission.tvqAmount) : "—"}</td>
              </tr>
              <tr>
                <td>
                  <strong>Total</strong>
                </td>
                <td className="num">
                  <strong>{soumission.totalWithTax !== null ? formatCurrency(soumission.totalWithTax) : "—"}</strong>
                </td>
              </tr>
            </tbody>
          </table>
        </section>

        {soumission.termsText && (
          <section className="pdf-export-section">
            <h2>Conditions</h2>
            <p style={{ whiteSpace: "pre-wrap" }}>{soumission.termsText}</p>
          </section>
        )}

        <footer className="pdf-export-footer">Exporté le {formatDate(new Date().toISOString())} — GSC Pilot</footer>
      </div>
    </div>
  );
}
