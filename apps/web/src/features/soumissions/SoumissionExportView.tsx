import { useEffect } from "react";
import { useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { CompanyLetterhead } from "../../components/CompanyLetterhead.js";
import { fetchCompanyLetterhead } from "../../lib/companyLetterhead.js";
import { fetchSoumissionDetail, formatCurrency } from "./api.js";

function formatDate(iso: string | null): string {
  return iso ? new Date(iso).toLocaleDateString("fr-CA", { year: "numeric", month: "long", day: "numeric" }) : "—";
}

/**
 * Vue d'export PDF d'une Soumission — même mécanisme que toujours
 * (BudgetExportView.tsx/DeliveryExportView.tsx : route autonome,
 * window.print(), aucun chiffre recalculé — fetchSoumissionDetail, même
 * fonction que SoumissionCard.tsx). Seuls les montants gelés à l'envoi
 * (amountBeforeTax/tpsAmount/tvqAmount/totalWithTax, tous null pour un
 * brouillon — voir SoumissionCard.tsx, le bouton Imprimer n'apparaît
 * qu'une fois envoyée) sont affichés, jamais une somme recalculée en
 * direct des lignes.
 *
 * Gabarit visuel (15 novembre 2026) — co-conçu avec Marie à partir de ses
 * vrais documents Sage (maquette Artifact), revampé plutôt que copié tel
 * quel : logo, bandeau rouge de marque sous l'en-tête, carte "Présenté à"
 * UNIQUE (plus de Vendu à/Expédié à dupliqué — rien n'est encore "vendu"
 * à ce stade), total mis en évidence dans un bandeau rouge. Ce même
 * gabarit (classes pdf-export-doc-header, pdf-export-client-card,
 * pdf-export-totals, theme.css) doit servir à l'identique pour la
 * Confirmation de commande et la Facture (Parties 2 et 3, pas encore
 * construites) — seuls le titre et le contenu des lignes/totaux
 * différeront alors (la Facture ajoutera une colonne % pour un jalon
 * partiel, voir le plan).
 */
export function SoumissionExportView() {
  const { id } = useParams<{ id: string }>();
  const detailQuery = useQuery({
    queryKey: ["soumission", id],
    queryFn: () => fetchSoumissionDetail(id!),
    enabled: !!id,
  });
  const letterheadQuery = useQuery({ queryKey: ["company-letterhead"], queryFn: fetchCompanyLetterhead });
  const soumission = detailQuery.data?.soumission;
  const identity = letterheadQuery.data?.identity;

  useEffect(() => {
    if (!soumission) return;
    const timer = setTimeout(() => window.print(), 400);
    return () => clearTimeout(timer);
  }, [soumission]);

  if (!id) return null;
  if (!soumission) return <div style={{ padding: 40 }}>{detailQuery.isError ? "Soumission introuvable." : "Chargement…"}</div>;

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
                <strong>{soumission.displayId}</strong>
              </div>
              <div>
                <span>Date </span>
                <strong>{formatDate(soumission.sentAt)}</strong>
              </div>
              <div>
                <span>Réf. budgétaire </span>
                <strong>{soumission.budgetDisplayId}</strong>
              </div>
            </div>
          </div>
        </div>

        <div className="pdf-export-doc-accent" />

        <div className="pdf-export-client-card">
          <div className="pdf-export-eyebrow">Présenté à</div>
          <strong>{soumission.company ?? soumission.contactName ?? "—"}</strong>
          {soumission.company && soumission.contactName && <div className="pdf-export-client-card-line">{soumission.contactName}</div>}
          {soumission.address && <div className="pdf-export-client-card-line">{soumission.address}</div>}
          {(soumission.email || soumission.phone) && (
            <div className="pdf-export-client-card-line">{[soumission.email, soumission.phone].filter(Boolean).join(" · ")}</div>
          )}
        </div>

        {soumission.introText && <p style={{ marginTop: 18, fontSize: 13, lineHeight: 1.6, whiteSpace: "pre-wrap" }}>{soumission.introText}</p>}

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
            {soumission.lines.map((line) => (
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
              <span>{soumission.amountBeforeTax !== null ? formatCurrency(soumission.amountBeforeTax) : "—"}</span>
            </div>
            <div className="pdf-export-totals-row">
              <span>TPS</span>
              <span>{soumission.tpsAmount !== null ? formatCurrency(soumission.tpsAmount) : "—"}</span>
            </div>
            <div className="pdf-export-totals-row pdf-export-totals-last">
              <span>TVQ</span>
              <span>{soumission.tvqAmount !== null ? formatCurrency(soumission.tvqAmount) : "—"}</span>
            </div>
            <div className="pdf-export-total-highlight">
              <strong>Montant total</strong>
              <strong>{soumission.totalWithTax !== null ? formatCurrency(soumission.totalWithTax) : "—"}</strong>
            </div>
          </div>
        </div>

        {soumission.termsText && (
          <div style={{ marginTop: 22 }}>
            <div className="pdf-export-eyebrow">Conditions</div>
            <p style={{ fontSize: 11.5, color: "var(--gsc-color-muted)", lineHeight: 1.55, whiteSpace: "pre-wrap" }}>{soumission.termsText}</p>
          </div>
        )}

        <div className="pdf-export-doc-footer">{registrationLine || " "}</div>
      </div>
    </div>
  );
}
