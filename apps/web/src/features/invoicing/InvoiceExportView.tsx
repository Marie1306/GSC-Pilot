import { useEffect } from "react";
import { useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { CompanyLetterhead } from "../../components/CompanyLetterhead.js";
import { fetchCompanyLetterhead } from "../../lib/companyLetterhead.js";
import { printWhenReady } from "../../lib/printWhenReady.js";
import { fetchInvoiceEntries, formatCurrency } from "./api.js";

function formatDate(iso: string | null): string {
  return iso ? new Date(iso).toLocaleDateString("fr-CA", { year: "numeric", month: "long", day: "numeric" }) : "—";
}

/**
 * Vue d'export PDF d'une Facture (Partie 3, 16 novembre 2026) — même
 * mécanisme et EXACTEMENT le même gabarit visuel que SoumissionExportView/
 * ConfirmationExportView.tsx (CompanyLetterhead, classes pdf-export-doc-*,
 * theme.css). Pas de notion de brouillon/aperçu ici : une facture n'existe
 * qu'une fois confirmInvoiceRequest déjà passé (numéro/taxes déjà gelés),
 * donc réutilise directement fetchInvoiceEntries + recherche par id, même
 * source que InvoiceDetailDrawer.tsx — aucune nouvelle route backend.
 *
 * Ventilation avenant (bogue corrigé le même jour, voir amendments.ts) :
 * la ligne du jalon affiche son montant de BASE (baseAmount), suivie d'une
 * ligne par avenant qui le cible (amendmentLines, pleine valeur, jamais
 * réduite par le %) — le total de la table retombe exactement sur
 * `amount`, déjà gelé et déjà celui utilisé pour les taxes.
 *
 * Ventilation par produit (16 novembre 2026, 2e correctif — premier test
 * réel en échec rapporté par Marie, voir CLAUDE.md) : pour un jalon de
 * Projet OU Roulement (étendu le 17 novembre 2026 — un Roulement peut aussi
 * avoir un budgétaire donc une Confirmation de commande) dont le budget
 * d'origine en a une, `entry.confirmationBreakdown` remplace la ligne
 * générique "{label} ({pct}%)" par les VRAIS produits de la confirmation
 * (qté/description/prix unitaire identiques, colonne % = ce jalon précis) —
 * gabarit confirmé par Marie (maquette). Pour un Call de service,
 * `entry.serviceCallBonsDeTravail` fait la même chose par Bon de travail
 * (Chantier D Partie 3) — une sous-section par BT, seulement ses propres
 * lignes (jamais une ligne à 0 $).
 *
 * `entry.lines` (17 novembre 2026) — PRIORITAIRE sur les deux ci-dessus
 * quand présentes : lignes saisies ou dérivées automatiquement PUIS
 * CONFIRMÉES au moment de "Demander la facturation" (Projet/Roulement/Vente
 * externe, jamais Call de service qui garde sa propre ventilation par Bon
 * de travail). Vide pour toute facture confirmée avant ce chantier — repli
 * sur confirmationBreakdown/serviceCallBonsDeTravail/l'ancien affichage
 * générique dans ce cas, jamais deviné.
 *
 * Dans tous les cas, le sous-total/TPS/TVQ/total affichés restent TOUJOURS
 * entry.amount/tpsAmount/tvqAmount/totalWithTax, jamais re-dérivés de ces
 * lignes.
 */
export function InvoiceExportView() {
  const { entryId } = useParams<{ entryId: string }>();
  const entriesQuery = useQuery({ queryKey: ["invoicing", "entries"], queryFn: fetchInvoiceEntries });
  const letterheadQuery = useQuery({ queryKey: ["company-letterhead"], queryFn: fetchCompanyLetterhead });
  const entry = entriesQuery.data?.entries.find((e) => e.id === entryId);
  const identity = letterheadQuery.data?.identity;

  useEffect(() => {
    if (!entry) return;
    return printWhenReady();
  }, [entry]);

  if (!entryId) return null;
  if (!entry) return <div style={{ padding: 40 }}>{entriesQuery.isError ? "Facture introuvable." : "Chargement…"}</div>;

  const registrationLine = [
    identity?.companyBusinessNumber && `N° d'entreprise ${identity.companyBusinessNumber}`,
    identity?.companyTpsNumber && `TPS ${identity.companyTpsNumber}`,
    identity?.companyTvqNumber && `TVQ ${identity.companyTvqNumber}`,
  ]
    .filter(Boolean)
    .join(" · ");

  const balance = (entry.totalWithTax ?? entry.amount) - entry.paidAmount;

  return (
    <div className="pdf-export">
      <button type="button" className="btn no-print" style={{ margin: 20 }} onClick={() => window.print()}>
        🖨️ Imprimer / Enregistrer en PDF
      </button>

      <div className="pdf-export-page">
        <div className="pdf-export-doc-header">
          <CompanyLetterhead />
          <div>
            <h1 className="pdf-export-doc-title">Facture</h1>
            <div className="pdf-export-doc-meta">
              <div>
                <span>N° </span>
                <strong>{entry.invoiceNumber ?? "—"}</strong>
              </div>
              <div>
                <span>Date </span>
                <strong>{formatDate(entry.processedAt)}</strong>
              </div>
              <div>
                <span>Réf. </span>
                <strong>{entry.sourceLabel}</strong>
              </div>
              {entry.confirmationBreakdown && (
                <>
                  <div>
                    <span>Réf. confirmation </span>
                    <strong>{entry.confirmationBreakdown.displayId}</strong>
                  </div>
                  <div>
                    <span>Jalon facturé </span>
                    <strong>
                      {entry.label} ({entry.pct} %)
                    </strong>
                  </div>
                </>
              )}
              {entry.dueDate && (
                <div>
                  <span>Échéance </span>
                  <strong>{formatDate(entry.dueDate)}</strong>
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="pdf-export-doc-accent" />

        <div className="pdf-export-client-card">
          <div className="pdf-export-eyebrow">Facturé à</div>
          <strong>{entry.company ?? entry.contactName ?? "—"}</strong>
          {entry.company && entry.contactName && <div className="pdf-export-client-card-line">{entry.contactName}</div>}
          {(entry.email || entry.phone) && <div className="pdf-export-client-card-line">{[entry.email, entry.phone].filter(Boolean).join(" · ")}</div>}
        </div>

        {!entry.lines?.length && entry.confirmationBreakdown?.introText && (
          <p style={{ marginTop: 18, fontSize: 13, lineHeight: 1.6, whiteSpace: "pre-wrap" }}>{entry.confirmationBreakdown.introText}</p>
        )}
        {entry.note && <p style={{ marginTop: 18, fontSize: 13, lineHeight: 1.6, whiteSpace: "pre-wrap" }}>{entry.note}</p>}

        {entry.lines && entry.lines.length > 0 ? (
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
              {entry.lines.map((line, index) => (
                <tr key={index}>
                  <td className="num">{line.quantity}</td>
                  <td>{line.description}</td>
                  <td className="num">{formatCurrency(line.unitPrice)}</td>
                  <td className="num" style={{ fontWeight: 650 }}>
                    {formatCurrency(line.amount)}
                  </td>
                </tr>
              ))}
              {entry.amendmentLines.map((line) => (
                <tr key={line.id}>
                  <td colSpan={3}>
                    Avenant {line.displayId}
                    {line.description ? ` — ${line.description}` : ""}
                  </td>
                  <td className="num" style={{ fontWeight: 650 }}>
                    {formatCurrency(line.amount)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : entry.confirmationBreakdown ? (
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
                <th className="num" style={{ width: 60 }}>
                  %
                </th>
                <th className="num" style={{ width: 110 }}>
                  Montant
                </th>
              </tr>
            </thead>
            <tbody>
              {entry.confirmationBreakdown.lines.map((line, index) => (
                <tr key={index}>
                  <td className="num">{line.quantity}</td>
                  <td>{line.description}</td>
                  <td className="num">{formatCurrency(line.unitPrice)}</td>
                  <td className="num">{line.pct} %</td>
                  <td className="num" style={{ fontWeight: 650 }}>
                    {formatCurrency(line.amount)}
                  </td>
                </tr>
              ))}
              {entry.amendmentLines.map((line) => (
                <tr key={line.id}>
                  <td colSpan={4}>
                    Avenant {line.displayId}
                    {line.description ? ` — ${line.description}` : ""}
                  </td>
                  <td className="num" style={{ fontWeight: 650 }}>
                    {formatCurrency(line.amount)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : entry.serviceCallBonsDeTravail && entry.serviceCallBonsDeTravail.length > 0 ? (
          <table className="pdf-export-doc-table" style={{ marginTop: 22 }}>
            {entry.serviceCallBonsDeTravail.map((bt) => (
              <tbody key={bt.id}>
                <tr>
                  <th colSpan={4} style={{ textAlign: "left", background: "var(--gsc-color-surface2)" }}>
                    Bon de travail {bt.displayId}
                    {bt.scheduledAt ? ` — ${formatDate(bt.scheduledAt)}` : ""}
                  </th>
                </tr>
                {bt.lines.length === 0 && (
                  <tr>
                    <td colSpan={4} style={{ color: "var(--gsc-color-muted)" }}>
                      Aucune ligne.
                    </td>
                  </tr>
                )}
                {bt.lines.map((line, index) => (
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
            ))}
          </table>
        ) : (
          <table className="pdf-export-doc-table" style={{ marginTop: 22 }}>
            <thead>
              <tr>
                <th>Description</th>
                <th className="num" style={{ width: 110 }}>
                  Montant
                </th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>
                  {entry.label}
                  {!entry.isExtra && ` (${entry.pct} %)`}
                </td>
                <td className="num">{formatCurrency(entry.baseAmount)}</td>
              </tr>
              {entry.amendmentLines.map((line) => (
                <tr key={line.id}>
                  <td>
                    Avenant {line.displayId}
                    {line.description ? ` — ${line.description}` : ""}
                  </td>
                  <td className="num">{formatCurrency(line.amount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {!entry.lines?.length && entry.confirmationBreakdown && (
          <p style={{ marginTop: 8, fontSize: 11.5, color: "var(--gsc-color-muted)", fontStyle: "italic" }}>
            Qté et Prix unitaire restent ceux de la confirmation de commande — la colonne % indique la portion facturée sur ce jalon ; Montant = Qté
            × Prix unitaire × %.
          </p>
        )}

        <div className="pdf-export-totals">
          <div className="pdf-export-totals-box">
            <div className="pdf-export-totals-row">
              <span>Sous-total</span>
              <span>{formatCurrency(entry.amount)}</span>
            </div>
            <div className="pdf-export-totals-row">
              <span>TPS</span>
              <span>{formatCurrency(entry.tpsAmount ?? 0)}</span>
            </div>
            <div className="pdf-export-totals-row pdf-export-totals-last">
              <span>TVQ</span>
              <span>{formatCurrency(entry.tvqAmount ?? 0)}</span>
            </div>
            <div className="pdf-export-total-highlight">
              <strong>Montant total</strong>
              <strong>{formatCurrency(entry.totalWithTax ?? entry.amount)}</strong>
            </div>
            {entry.paidAmount > 0 && (
              <>
                <div className="pdf-export-totals-row" style={{ marginTop: 8 }}>
                  <span>Payé{entry.paidAt ? ` (${formatDate(entry.paidAt)})` : ""}</span>
                  <span>{formatCurrency(entry.paidAmount)}</span>
                </div>
                <div className="pdf-export-totals-row pdf-export-totals-last">
                  <strong>Solde dû</strong>
                  <strong>{formatCurrency(balance)}</strong>
                </div>
              </>
            )}
          </div>
        </div>

        {!entry.lines?.length && entry.confirmationBreakdown?.termsText && (
          <div style={{ marginTop: 22 }}>
            <div className="pdf-export-eyebrow">Conditions</div>
            <p style={{ fontSize: 11.5, color: "var(--gsc-color-muted)", lineHeight: 1.55, whiteSpace: "pre-wrap" }}>{entry.confirmationBreakdown.termsText}</p>
          </div>
        )}

        <div className="pdf-export-doc-footer">{registrationLine || " "}</div>
      </div>
    </div>
  );
}
