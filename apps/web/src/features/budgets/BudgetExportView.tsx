import { useEffect } from "react";
import { useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "../../lib/auth/useAuth.js";
import { fetchBudgetDetail, formatCurrency, computeDetailedSummary, STATUS_LABELS, REQUEST_TYPE_LABELS, type RequestType } from "./api.js";
import "./budgets.css";

function formatDate(iso: string | null): string {
  return iso ? new Date(iso).toLocaleDateString("fr-CA", { year: "numeric", month: "long", day: "numeric" }) : "—";
}

/**
 * Vue d'export PDF du budgétaire (18 août 2026) — route autonome, hors
 * AppShell (pas de barre latérale), pour que l'impression navigateur
 * ("Enregistrer en PDF" comme destination) ne capture que le contenu
 * imprimable. Un seul format simple : sommaire déjà vérifié
 * (computeDetailedSummary, même fonction que la vue interactive — jamais
 * recalculé différemment), pas le détail ligne par ligne ni le futur
 * système de modèles PDF configurables (Paramètres, référencé dans la
 * spec, hors de cette passe). Déclenche l'impression automatiquement à
 * l'ouverture; le bouton reste au cas où le navigateur bloque le
 * déclenchement automatique.
 */
export function BudgetExportView() {
  const { id } = useParams<{ id: string }>();
  const { employee } = useAuth();
  const detailQuery = useQuery({
    queryKey: ["budget", id],
    queryFn: () => fetchBudgetDetail(id!),
    enabled: !!id,
  });
  const budget = detailQuery.data?.budget;

  useEffect(() => {
    if (!budget) return;
    const timer = setTimeout(() => window.print(), 400);
    return () => clearTimeout(timer);
  }, [budget]);

  if (!id) return null;
  if (!budget) return <div style={{ padding: 40 }}>{detailQuery.isError ? "Budgétaire introuvable." : "Chargement…"}</div>;

  const detailedSummary = computeDetailedSummary(budget);

  return (
    <div className="budget-export">
      <button type="button" className="btn no-print" style={{ margin: 20 }} onClick={() => window.print()}>
        🖨️ Imprimer / Enregistrer en PDF
      </button>

      <div className="budget-export-page">
        <header className="budget-export-header">
          <div>
            <div className="budget-export-brand">GSC Automation</div>
            <h1>
              Budgétaire {budget.displayId} — {budget.company ?? budget.contactName}
            </h1>
          </div>
          <div className="budget-export-status">{STATUS_LABELS[budget.status] ?? budget.status}</div>
        </header>

        <section className="budget-export-section">
          <h2>Client et demande</h2>
          <div className="detail-grid">
            <div>
              <span className="detail-label">Entreprise</span>
              <span>{budget.company ?? "—"}</span>
            </div>
            <div>
              <span className="detail-label">Contact</span>
              <span>{budget.contactName}</span>
            </div>
            <div>
              <span className="detail-label">Courriel</span>
              <span>{budget.email ?? "—"}</span>
            </div>
            <div>
              <span className="detail-label">Téléphone</span>
              <span>{budget.phone ?? "—"}</span>
            </div>
            <div>
              <span className="detail-label">Type prévu</span>
              <span>{(budget.requestType && REQUEST_TYPE_LABELS[budget.requestType as RequestType]) ?? budget.requestType ?? "—"}</span>
            </div>
            <div>
              <span className="detail-label">Date de la demande</span>
              <span>{formatDate(budget.requestCreatedAt)}</span>
            </div>
          </div>
        </section>

        <section className="budget-export-section">
          <h2>Informations du budgétaire</h2>
          <div className="detail-grid">
            <div>
              <span className="detail-label">PO client</span>
              <span>{budget.poNumber ?? "—"}</span>
            </div>
            <div>
              <span className="detail-label">Quantité</span>
              <span>{budget.quantity}</span>
            </div>
            <div>
              <span className="detail-label">Valide jusqu'au</span>
              <span>{formatDate(budget.validUntil)}</span>
            </div>
            <div>
              <span className="detail-label">Créé par</span>
              <span>{budget.createdByName}</span>
            </div>
          </div>
          {budget.summary && (
            <div className="field field-full">
              <span className="detail-label">Résumé du budgétaire</span>
              <p>{budget.summary}</p>
            </div>
          )}
          {budget.riskSummary && (
            <div className="field field-full">
              <span className="detail-label">Résumé des risques</span>
              <p>{budget.riskSummary}</p>
            </div>
          )}
        </section>

        <section className="budget-export-section">
          <h2>Sommaire financier</h2>
          <div className="stat-tile-grid">
            <div className="stat-tile">
              <span className="stat-tile-label">Heures totales</span>
              <span className="stat-tile-value">{budget.totals.totalHours}</span>
            </div>
            <div className="stat-tile">
              <span className="stat-tile-label">Coût planifié</span>
              <span className="stat-tile-value">{formatCurrency(detailedSummary.coutPlanifie)}</span>
            </div>
            <div className="stat-tile">
              <span className="stat-tile-label">Marge résultante</span>
              <span className="stat-tile-value">{detailedSummary.margeResultante} %</span>
            </div>
            <div className="stat-tile">
              <span className="stat-tile-label">Grand total — prix de vente</span>
              <span className="stat-tile-value">{formatCurrency(budget.totals.totalSale)}</span>
            </div>
          </div>
        </section>

        <section className="budget-export-section">
          <h2>Aperçu par catégorie</h2>
          <table className="shortlist-table">
            <thead>
              <tr>
                <th>Catégorie</th>
                <th className="num">Heures</th>
                <th className="num">Coût planifié</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>Conception &amp; Dessin</td>
                <td className="num">{detailedSummary.conception.hours} h</td>
                <td className="num">{formatCurrency(detailedSummary.conception.cost)}</td>
              </tr>
              <tr>
                <td>Fabrication &amp; Assemblage</td>
                <td className="num">{detailedSummary.fabricationAssemblage.hours} h</td>
                <td className="num">{formatCurrency(detailedSummary.fabricationAssemblage.cost)}</td>
              </tr>
              <tr>
                <td>Panneau &amp; Programmation</td>
                <td className="num">{detailedSummary.panelProgramming.hours} h</td>
                <td className="num">{formatCurrency(detailedSummary.panelProgramming.cost)}</td>
              </tr>
              <tr>
                <td>Sous-traitance</td>
                <td className="num">—</td>
                <td className="num">{formatCurrency(detailedSummary.subcontracting.cost)}</td>
              </tr>
              <tr>
                <td>Installation — Heures</td>
                <td className="num">{detailedSummary.installationLabor.hours} h</td>
                <td className="num">{formatCurrency(detailedSummary.installationLabor.cost)}</td>
              </tr>
              <tr>
                <td>Installation — Stock et frais divers</td>
                <td className="num">—</td>
                <td className="num">{formatCurrency(detailedSummary.installationStockExpenses.cost)}</td>
              </tr>
              <tr>
                <td>Achats détaillés (autres catégories)</td>
                <td className="num">—</td>
                <td className="num">{formatCurrency(detailedSummary.achatsDetailles)}</td>
              </tr>
            </tbody>
          </table>
        </section>

        <section className="budget-export-section">
          <h2>Réserves</h2>
          <div className="detail-grid">
            <div>
              <span className="detail-label">Back-up d'heures</span>
              <span>
                {budget.backup.hours} h · {formatCurrency(budget.backup.baseCost)}
              </span>
            </div>
            <div>
              <span className="detail-label">Back-up projet</span>
              <span>{formatCurrency(budget.projectBackup.baseCost)}</span>
            </div>
          </div>
        </section>

        <footer className="budget-export-footer">
          Exporté le {formatDate(new Date().toISOString())}
          {employee && <> par {employee.name}</>} — GSC Pilot
        </footer>
      </div>
    </div>
  );
}
