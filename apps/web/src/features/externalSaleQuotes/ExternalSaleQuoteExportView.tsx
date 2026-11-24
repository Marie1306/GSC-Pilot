import { useEffect } from "react";
import { useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { externalSaleInvoiceLines } from "@gsc-pilot/business-rules";
import { CompanyLetterhead } from "../../components/CompanyLetterhead.js";
import { fetchCompanyLetterhead } from "../../lib/companyLetterhead.js";
import { printWhenReady } from "../../lib/printWhenReady.js";
import { fetchExternalSaleQuoteDetail, formatCurrency } from "./api.js";

function formatDate(iso: string | null): string {
  return iso ? new Date(iso).toLocaleDateString("fr-CA", { year: "numeric", month: "long", day: "numeric" }) : "—";
}

/**
 * Vue d'export PDF d'une Soumission de Vente externe (23 novembre 2026) —
 * même gabarit visuel que SoumissionExportView.tsx (fichier séparé, jamais
 * partagé entre les deux mécanismes, même principe que
 * SoumissionExportView/ConfirmationExportView déjà deux fichiers
 * distincts) : CompanyLetterhead, bandeau de marque, carte "Présenté à",
 * table de lignes, boîte de totaux AVEC taxes (décision confirmée — le
 * client voit le montant total à payer, contrairement au prix hors-taxes
 * affiché à l'écran pour une Vente externe). Seuls les montants gelés à
 * l'envoi sont affichés, jamais recalculés en direct — voir
 * sendExternalSaleQuote côté serveur.
 */
export function ExternalSaleQuoteExportView() {
  const { id } = useParams<{ id: string }>();
  const detailQuery = useQuery({ queryKey: ["external-sale-quote", id], queryFn: () => fetchExternalSaleQuoteDetail(id!), enabled: !!id });
  const letterheadQuery = useQuery({ queryKey: ["company-letterhead"], queryFn: fetchCompanyLetterhead });
  const quote = detailQuery.data;
  const identity = letterheadQuery.data?.identity;

  useEffect(() => {
    if (!quote) return;
    return printWhenReady();
  }, [quote]);

  if (!id) return null;
  if (!quote) {
    return <div style={{ padding: 40 }}>{detailQuery.isError ? "Soumission introuvable." : "Chargement…"}</div>;
  }

  // Lignes au PRIX, jamais le coût interne (unitCost) — un client ne doit
  // jamais voir les coûts de GSC Automation. Même calcul exact que la
  // ventilation de Facture (externalSaleInvoiceLines, 17 novembre 2026) :
  // marge réappliquée par pièce + frais administratifs divisés par le
  // nombre d'unités, transport en ligne séparée.
  const invoiceLines = externalSaleInvoiceLines(
    quote.lines.map((line) => ({ description: line.description, qty: line.qty, unitCost: line.unitCost })),
    quote.transportFee,
    quote.adminFee,
    quote.marginPct,
  );

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
            <h1 className="pdf-export-doc-title">Soumission</h1>
            <div className="pdf-export-doc-meta">
              <div>
                <span>N° </span>
                <strong>{quote.displayId}</strong>
              </div>
              <div>
                <span>Date </span>
                <strong>{formatDate(quote.sentAt ?? quote.createdAt)}</strong>
              </div>
            </div>
          </div>
        </div>

        <div className="pdf-export-doc-accent" />

        <div className="pdf-export-client-card">
          <div className="pdf-export-eyebrow">Présenté à</div>
          <strong>{quote.company ?? quote.contactName}</strong>
          {quote.company && <div className="pdf-export-client-card-line">{quote.contactName}</div>}
          {(quote.email || quote.phone) && <div className="pdf-export-client-card-line">{[quote.email, quote.phone].filter(Boolean).join(" · ")}</div>}
        </div>

        {quote.introText && <p style={{ marginTop: 18, fontSize: 13, lineHeight: 1.6, whiteSpace: "pre-wrap" }}>{quote.introText}</p>}

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
            {invoiceLines.map((line, index) => (
              <tr key={index}>
                <td className="num">{line.quantity}</td>
                <td>{line.description}</td>
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
              <span>{quote.salePrice !== null ? formatCurrency(quote.salePrice) : "—"}</span>
            </div>
            <div className="pdf-export-totals-row">
              <span>TPS</span>
              <span>{quote.tpsAmount !== null ? formatCurrency(quote.tpsAmount) : "—"}</span>
            </div>
            <div className="pdf-export-totals-row pdf-export-totals-last">
              <span>TVQ</span>
              <span>{quote.tvqAmount !== null ? formatCurrency(quote.tvqAmount) : "—"}</span>
            </div>
            <div className="pdf-export-total-highlight">
              <strong>Montant total</strong>
              <strong>{quote.totalWithTax !== null ? formatCurrency(quote.totalWithTax) : "—"}</strong>
            </div>
          </div>
        </div>

        {quote.termsText && (
          <div style={{ marginTop: 22 }}>
            <div className="pdf-export-eyebrow">Conditions</div>
            <p style={{ fontSize: 11.5, color: "var(--gsc-color-muted)", lineHeight: 1.55, whiteSpace: "pre-wrap" }}>{quote.termsText}</p>
          </div>
        )}

        <div className="pdf-export-doc-footer">{registrationLine || " "}</div>
      </div>
    </div>
  );
}
