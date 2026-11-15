import { useEffect } from "react";
import { useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { CompanyLetterhead } from "../../components/CompanyLetterhead.js";
import { fetchCompanyLetterhead } from "../../lib/companyLetterhead.js";
import { fetchConfirmationDetail, formatCurrency } from "./api.js";

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("fr-CA", { year: "numeric", month: "long", day: "numeric" });
}

/**
 * Vue d'export PDF d'une Confirmation de commande (Partie 2, 15 novembre
 * 2026) — même mécanisme que SoumissionExportView.tsx (route autonome,
 * window.print(), aucun chiffre recalculé) et EXACTEMENT le même gabarit
 * visuel (classes pdf-export-doc-header/pdf-export-client-card/
 * pdf-export-totals, theme.css, co-conçu avec Marie) — « même disposition,
 * seul le libellé change » (confirmé 15 novembre 2026). Seules différences
 * de contenu : Réf. soumission au lieu de Réf. budgétaire, No de bon de
 * commande du client si fourni, pas de notion de statut (une confirmation
 * naît déjà complète, copie gelée d'une soumission déjà acceptée).
 */
export function ConfirmationExportView() {
  const { id } = useParams<{ id: string }>();
  const detailQuery = useQuery({
    queryKey: ["confirmation", id],
    queryFn: () => fetchConfirmationDetail(id!),
    enabled: !!id,
  });
  const letterheadQuery = useQuery({ queryKey: ["company-letterhead"], queryFn: fetchCompanyLetterhead });
  const confirmation = detailQuery.data?.confirmation;
  const identity = letterheadQuery.data?.identity;

  useEffect(() => {
    if (!confirmation) return;
    const timer = setTimeout(() => window.print(), 400);
    return () => clearTimeout(timer);
  }, [confirmation]);

  if (!id) return null;
  if (!confirmation) return <div style={{ padding: 40 }}>{detailQuery.isError ? "Confirmation de commande introuvable." : "Chargement…"}</div>;

  const registrationLine = [
    identity?.companyBusinessNumber && `N° d'entreprise ${identity.companyBusinessNumber}`,
    identity?.companyTpsNumber && `TPS ${identity.companyTpsNumber}`,
    identity?.companyTvqNumber && `TVQ ${identity.companyTvqNumber}`,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <div className="pdf-export">
      <button type="button" className="btn no-print" style={{ margin: 20 }} onClick={() => window.print()}>
        🖨️ Imprimer / Enregistrer en PDF
      </button>

      <div className="pdf-export-page">
        <div className="pdf-export-doc-header">
          <CompanyLetterhead />
          <div>
            <h1 className="pdf-export-doc-title">Confirmation de commande</h1>
            <div className="pdf-export-doc-meta">
              <div>
                <span>N° </span>
                <strong>{confirmation.displayId}</strong>
              </div>
              <div>
                <span>Date </span>
                <strong>{formatDate(confirmation.createdAt)}</strong>
              </div>
              <div>
                <span>Réf. soumission </span>
                <strong>{confirmation.soumissionDisplayId}</strong>
              </div>
              {confirmation.clientPoNumber && (
                <div>
                  <span>No bon de commande </span>
                  <strong>{confirmation.clientPoNumber}</strong>
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="pdf-export-doc-accent" />

        <div className="pdf-export-client-card">
          <div className="pdf-export-eyebrow">Présenté à</div>
          <strong>{confirmation.company ?? confirmation.contactName ?? "—"}</strong>
          {confirmation.company && confirmation.contactName && <div className="pdf-export-client-card-line">{confirmation.contactName}</div>}
          {confirmation.address && <div className="pdf-export-client-card-line">{confirmation.address}</div>}
          {(confirmation.email || confirmation.phone) && (
            <div className="pdf-export-client-card-line">{[confirmation.email, confirmation.phone].filter(Boolean).join(" · ")}</div>
          )}
        </div>

        {confirmation.introText && <p style={{ marginTop: 18, fontSize: 13, lineHeight: 1.6, whiteSpace: "pre-wrap" }}>{confirmation.introText}</p>}

        <table className="pdf-export-doc-table" style={{ marginTop: 22 }}>
          <thead>
            <tr>
              <th className="num" style={{ width: 44 }}>
                Qté
              </th>
              <th>Description</th>
              <th className="num" style={{ width: 110 }}>
                Prix unitaire
              </th>
              <th className="num" style={{ width: 110 }}>
                Montant
              </th>
            </tr>
          </thead>
          <tbody>
            {confirmation.lines.map((line) => (
              <tr key={line.id}>
                <td className="num">{line.qty}</td>
                <td>{line.label}</td>
                <td className="num">{formatCurrency(line.unitPrice)}</td>
                <td className="num" style={{ fontWeight: 650 }}>
                  {formatCurrency(line.amount)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="pdf-export-totals">
          <div className="pdf-export-totals-box">
            <div className="pdf-export-totals-row">
              <span>Sous-total</span>
              <span>{formatCurrency(confirmation.amountBeforeTax)}</span>
            </div>
            <div className="pdf-export-totals-row">
              <span>TPS</span>
              <span>{formatCurrency(confirmation.tpsAmount)}</span>
            </div>
            <div className="pdf-export-totals-row pdf-export-totals-last">
              <span>TVQ</span>
              <span>{formatCurrency(confirmation.tvqAmount)}</span>
            </div>
            <div className="pdf-export-total-highlight">
              <strong>Montant total</strong>
              <strong>{formatCurrency(confirmation.totalWithTax)}</strong>
            </div>
          </div>
        </div>

        {confirmation.termsText && (
          <div style={{ marginTop: 22 }}>
            <div className="pdf-export-eyebrow">Conditions</div>
            <p style={{ fontSize: 11.5, color: "var(--gsc-color-muted)", lineHeight: 1.55, whiteSpace: "pre-wrap" }}>{confirmation.termsText}</p>
          </div>
        )}

        <div className="pdf-export-doc-footer">{registrationLine || " "}</div>
      </div>
    </div>
  );
}
