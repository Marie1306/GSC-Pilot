import { useEffect } from "react";
import { useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "../../lib/auth/useAuth.js";
import {
  fetchBudgetDetail,
  formatCurrency,
  computeDetailedSummary,
  STATUS_LABELS,
  CATEGORY_LABELS,
  REQUEST_TYPE_LABELS,
  type RequestType,
  type BudgetSectionData,
  type BudgetSectionRow,
} from "./api.js";

function formatDate(iso: string | null): string {
  return iso ? new Date(iso).toLocaleDateString("fr-CA", { year: "numeric", month: "long", day: "numeric" }) : "—";
}

function truncate(text: string | null, max: number): string {
  if (!text) return "—";
  return text.length > max ? `${text.slice(0, max).trim()}…` : text;
}

/** Quantité/heures et taux/prix unitaire, ramenés à une seule paire de colonnes communes aux deux types de ligne — même valeurs déjà éditées dans la vue interactive, juste affichées côte à côte plutôt que dans des colonnes séparées par type. */
function rowQty(row: BudgetSectionRow, kind: "labor" | "purchase"): number {
  return kind === "labor" ? row.hours : row.qty;
}
function rowRate(row: BudgetSectionRow, kind: "labor" | "purchase"): number {
  return kind === "labor" ? row.hourlyRate : row.unitPrice;
}
/** Coût de la ligne — simple produit qté×taux, aucune règle métier (la marge/majoration reste un concept PAR SECTION, jamais par ligne — voir margin.ts/sections.ts, jamais réimplémenté ici). */
function rowCost(row: BudgetSectionRow, kind: "labor" | "purchase"): number {
  return rowQty(row, kind) * rowRate(row, kind);
}

/**
 * Descriptions par catégorie — vérifiées avec l'utilisatrice (exemple HTML
 * fourni le 18 août 2026), expliquent comment chaque catégorie détaillée du
 * budgétaire se regroupe dans la vue Projet, plus simple.
 */
const SECTION_CAPTIONS: Record<string, string> = {
  conception: "Toutes les lignes du budgétaire Excel; regroupées en Conception au stade projet",
  fabrication: "Sous-catégories conservées au stade projet",
  panelProgramming: "Regroupées en une catégorie au stade projet",
  assemblyTest: "Assemblage, essais, finition, emballage et ménage",
  stockFabrication: "Achats distincts au stade budgétaire; regroupés en achats bruts au projet · 10 lignes vierges au départ, lignes ajustables",
  stockPanel: "Composants de panneau et automatisation · 10 lignes vierges au départ, lignes ajustables",
  motorization: "Moteurs, variateurs, capteurs, contrôleurs et périphériques · 10 lignes vierges au départ, lignes ajustables",
  hardware: "Boulonnerie, pneumatique, hydraulique, outillage et autres · 10 lignes vierges au départ, lignes ajustables",
  consumables: "Montants libres; modifiables par la Direction et le Propriétaire",
  subcontracting: "Fournisseurs externes · 10 lignes vierges au départ, lignes ajustables",
  installationLabor: "Détaillée selon le budgétaire Excel; regroupée en Installation au projet",
  installationStock: "Matériel et consommables d'installation · 10 lignes vierges au départ, lignes ajustables",
  installationExpenses: "Toutes les lignes du fichier Excel",
};

function BudgetExportSection({ section }: { section: BudgetSectionData }) {
  return (
    <section className="budget-export-cat">
      <h2>{CATEGORY_LABELS[section.category] ?? section.category}</h2>
      <p>{SECTION_CAPTIONS[section.category] ?? ""}</p>
      <table>
        <thead>
          <tr>
            <th>Catégorie</th>
            <th className="num">Quantité / heures</th>
            <th className="num">Taux / prix unitaire</th>
            <th className="num">Complexité</th>
            <th className="num">Majoration</th>
            <th className="num">Coût</th>
            <th className="num">Prix de vente</th>
            <th>Risque / note</th>
          </tr>
        </thead>
        <tbody>
          {section.rows.map((row) => (
            <tr key={row.id}>
              <td>{row.label}</td>
              <td className="num">{rowQty(row, section.kind).toFixed(2)}</td>
              <td className="num">{formatCurrency(rowRate(row, section.kind))}</td>
              <td className="num">{section.complexity}</td>
              <td className="num">{section.margin} %</td>
              <td className="num">{formatCurrency(rowCost(row, section.kind))}</td>
              {/* Prix de vente par ligne = coût de la ligne (aucune majoration distribuée par ligne, seulement au total de section) — même choix que l'exemple fourni. */}
              <td className="num">{formatCurrency(rowCost(row, section.kind))}</td>
              <td>{row.risk ?? ""}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr>
            <th colSpan={5}>Total de section</th>
            <th className="num">{formatCurrency(section.baseCost)}</th>
            <th className="num">{formatCurrency(section.sale)}</th>
            <th></th>
          </tr>
        </tfoot>
      </table>
    </section>
  );
}

/**
 * Vue d'export PDF du budgétaire (18 août 2026, reconstruite le même jour
 * après retour de l'utilisatrice — la première version résumait par
 * groupe de 6, incomplète). Portrait complet et détaillé, ligne par ligne,
 * des 13 catégories réelles — même structure que l'exemple HTML fourni.
 * Route autonome, hors AppShell, imprimée via window.print() ("Enregistrer
 * en PDF" comme destination) — pas de dépendance serveur. Coûts de section
 * (section.baseCost/sale) et sommaire global (computeDetailedSummary)
 * réutilisent exactement les mêmes fonctions que la vue interactive,
 * jamais recalculés différemment; seul le coût PAR LIGNE (qté×taux) est
 * dérivé ici, un simple produit sans aucune règle métier propre.
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
            <div className="budget-export-brand">GSC Automation — Budgétaire {budget.displayId}</div>
            <p>
              <strong>Client :</strong> {budget.company ?? budget.contactName} &nbsp; <strong>Demande :</strong>{" "}
              {truncate(budget.requestSummary, 80)}
            </p>
            <p>
              <strong>Contact :</strong> {budget.contactName} &nbsp; <strong>PO client :</strong> {budget.poNumber ?? "—"}
            </p>
          </div>
          <div className="budget-export-status">{STATUS_LABELS[budget.status] ?? budget.status}</div>
        </header>

        <div className="budget-export-summary">
          <div className="budget-export-box">
            <span>Coût planifié</span>
            <strong>{formatCurrency(detailedSummary.coutPlanifie)}</strong>
          </div>
          <div className="budget-export-box">
            <span>Achats détaillés</span>
            <strong>{formatCurrency(detailedSummary.achatsDetailles)}</strong>
          </div>
          <div className="budget-export-box">
            <span>Prix de vente avant taxes</span>
            <strong>{formatCurrency(budget.totals.totalSale)}</strong>
          </div>
          <div className="budget-export-box">
            <span>Marge résultante</span>
            <strong>{detailedSummary.margeResultante} %</strong>
          </div>
        </div>

        <div className="budget-export-notes">
          <strong>Résumé</strong>
          <p>{budget.summary || "—"}</p>
          <strong>Risques</strong>
          <p>{budget.riskSummary || "—"}</p>
          <strong>Type prévu</strong>
          <p>{(budget.requestType && REQUEST_TYPE_LABELS[budget.requestType as RequestType]) ?? budget.requestType ?? "—"}</p>
          <strong>Courriel / Téléphone</strong>
          <p>
            {budget.email ?? "—"} · {budget.phone ?? "—"}
          </p>
        </div>

        {budget.sections.map((section) => (
          <BudgetExportSection key={section.id} section={section} />
        ))}

        {/* Réserves — deux sections distinctes, même traitement que les 13 catégories ci-dessus (elles ont chacune leur propre coût/marge/prix de vente, voir sections.ts). */}
        <section className="budget-export-cat">
          <h2>Back-up d'heures</h2>
          <p>Réserve calculée automatiquement sur Fabrication + Panneau &amp; Programmation + Assemblage &amp; Test — non punchable.</p>
          <table>
            <thead>
              <tr>
                <th className="num">Heures</th>
                <th className="num">Complexité</th>
                <th className="num">Majoration</th>
                <th className="num">Coût planifié</th>
                <th className="num">Prix de vente</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td className="num">{budget.backup.hours} h</td>
                <td className="num">{budget.backupHoursComplexity}</td>
                <td className="num">{budget.backup.margin} %</td>
                <td className="num">{formatCurrency(budget.backup.baseCost)}</td>
                <td className="num">{formatCurrency(budget.backup.sale)}</td>
              </tr>
            </tbody>
          </table>
        </section>

        <section className="budget-export-cat">
          <h2>Back-up projet</h2>
          <p>Réserve distincte du back-up d'heures ci-dessus — montant saisi à la main, non punchable, la complexité détermine seulement la marge.</p>
          <table>
            <thead>
              <tr>
                <th className="num">Complexité</th>
                <th className="num">Majoration</th>
                <th className="num">Coût planifié</th>
                <th className="num">Prix de vente</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td className="num">{budget.projectBackupComplexity}</td>
                <td className="num">{budget.projectBackup.margin} %</td>
                <td className="num">{formatCurrency(budget.projectBackup.baseCost)}</td>
                <td className="num">{formatCurrency(budget.projectBackup.sale)}</td>
              </tr>
            </tbody>
          </table>
        </section>

        <footer className="budget-export-footer">
          Exporté le {formatDate(new Date().toISOString())}
          {employee && <> par {employee.name}</>} — GSC Pilot
        </footer>
      </div>
    </div>
  );
}
