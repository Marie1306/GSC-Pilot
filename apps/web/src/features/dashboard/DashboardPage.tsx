import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { useAuth } from "../../lib/auth/useAuth.js";
import { fetchDashboardSummary, formatCurrency } from "./api.js";
import { INVOICE_STATUS_LABELS, INVOICE_STATUS_BADGE } from "../invoicing/api.js";
import { linkFor, type ActionItemType } from "../actionCenter/api.js";
import "../actionCenter/actionCenter.css";

const PERSONA_LABELS: Record<string, string> = {
  owner: "Direction",
  admin: "Administration",
  boss: "Propriétaire",
  member: "Employé",
  warehouse: "Magasinier",
};

const ACTION_TYPE_ICON: Record<ActionItemType, string> = {
  budget_approval: "🧮",
  purchase_approval: "🛒",
  purchase_to_order: "📦",
  invoicing: "📄",
  client_request_new: "📞",
  client_request_transmitted: "📞",
  subassembly_ready: "🔗",
  hours_approval: "⏱️",
  followup_due: "📅",
};

const FINANCIAL_STATUS_LABELS: Record<string, string> = {
  conforme: "Conforme",
  at_risk: "À risque",
  critical: "Critique",
};

interface Tile {
  label: string;
  value: number | string;
  sub?: string;
}

function formatDate(iso: string | null): string {
  return iso ? new Date(iso).toLocaleDateString("fr-CA", { day: "numeric", month: "short" }) : "—";
}

/**
 * Vue de synthèse personnalisée par utilisateur (spec confirmée, 21 août
 * 2026, enrichie le 23 août 2026 après comparaison avec le tableau de bord
 * v19). L'utilisatrice a confirmé vouloir le pipeline par canal et le
 * suivi des factures visibles ICI en plus de Rapports/Facturation — « le
 * but d'un tableau de bord est justement de voir rapidement tout ce qui
 * est actif » — donc pas des doublons à retirer, contrairement au mini
 * Centre d'actions de v19 (item par item) qui, lui, reste seulement un
 * compte + une ventilation, la liste complète existe déjà comme page à
 * part entière. Chaque section réutilise un calcul déjà vérifié d'un autre
 * module (voir dashboard/service.ts) — jamais un second calcul divergent.
 */
export function DashboardPage() {
  const { employee } = useAuth();
  const summaryQuery = useQuery({ queryKey: ["dashboard", "summary"], queryFn: fetchDashboardSummary });
  const summary = summaryQuery.data?.summary;

  if (!employee) return null;

  const tiles: Tile[] = [];
  if (summary?.activeProjectsCount !== undefined || summary?.activeRollingsCount !== undefined) {
    const projects = summary?.activeProjectsCount ?? 0;
    const rollings = summary?.activeRollingsCount ?? 0;
    tiles.push({ label: "Projets et roulements actifs", value: projects + rollings, sub: `${projects} projet(s) · ${rollings} roulement(s)` });
  }
  if (summary?.budgetsInProgressCount !== undefined) {
    tiles.push({ label: "Budgétaires en cours", value: summary.budgetsInProgressCount });
  }
  if (summary?.receivableBalance !== undefined) {
    tiles.push({ label: "Solde à recevoir", value: formatCurrency(summary.receivableBalance) });
  }
  if (summary?.invoicingToProcessCount !== undefined) {
    tiles.push({ label: "Facturation à traiter", value: summary.invoicingToProcessCount });
  }
  if (summary?.portfolioMarginPct !== undefined) {
    tiles.push({ label: "Marge réelle — projets actifs", value: `${summary.portfolioMarginPct} %` });
  }
  if (summary) {
    tiles.push({ label: "Actions en attente", value: summary.actionCenterCount, sub: summary.actionCenterBreakdown || undefined });
    tiles.push({ label: "Mes heures cette semaine", value: `${summary.myWeekHours} h` });
    tiles.push({ label: "Mes entrées en attente", value: summary.myPendingEntriesCount });
  }
  if (summary?.myAssignedDeliveriesCount !== undefined) {
    tiles.push({ label: "Mes livraisons à faire", value: summary.myAssignedDeliveriesCount });
  }

  const projectHealth = summary?.projectHealth ?? [];
  const showMargin = projectHealth[0]?.grossMarginPct !== undefined;
  const showStatus = projectHealth[0]?.financialStatus !== undefined;

  return (
    <div>
      <div>
        <h1 style={{ marginTop: 0, marginBottom: 4, fontSize: 22 }}>Bonjour, {employee.name}</h1>
        <p style={{ color: "var(--gsc-color-muted)", margin: 0 }}>
          Connecté comme <strong>{PERSONA_LABELS[employee.persona] ?? employee.persona}</strong>.
        </p>
      </div>

      <div className="card" style={{ marginTop: 20 }}>
        {summaryQuery.isError ? (
          <p className="form-error">Impossible de charger le tableau de bord.</p>
        ) : !summary ? (
          <p style={{ color: "var(--gsc-color-muted)", fontSize: 13 }}>Chargement…</p>
        ) : (
          <div className="stat-tile-grid">
            {tiles.map((tile) => (
              <div key={tile.label} className="stat-tile">
                <span className="stat-tile-label">{tile.label}</span>
                <span className="stat-tile-value">{tile.value}</span>
                {tile.sub && <span className="cell-sub">{tile.sub}</span>}
              </div>
            ))}
          </div>
        )}
      </div>

      {projectHealth.length > 0 && (
        <div className="card" style={{ marginTop: 20 }}>
          <div className="card-band-header">
            <div>
              <h3 style={{ margin: 0 }}>Santé des projets actifs</h3>
              <p className="modal-subtitle">Avancement, marge réelle et échéance des projets actifs.</p>
            </div>
            <Link to="/projets" className="btn btn-secondary btn-small">
              Tous les projets
            </Link>
          </div>
          <div className="table-scroll" style={{ marginTop: 10 }}>
            <table className="shortlist-table">
              <thead>
                <tr>
                  <th>Projet</th>
                  <th className="num">Avancement</th>
                  {showMargin && <th className="num">Marge réelle</th>}
                  <th>Échéance</th>
                  {showStatus && <th>Statut</th>}
                </tr>
              </thead>
              <tbody>
                {projectHealth.map((p) => (
                  <tr key={p.projectNumber}>
                    <td>
                      <strong>{p.projectNumber}</strong>
                      <div className="cell-sub">{p.name}</div>
                      <div className="progress-track" style={{ marginTop: 4, maxWidth: 160 }}>
                        <div className="progress-fill" style={{ width: `${Math.min(100, p.progressionPct)}%` }} />
                      </div>
                    </td>
                    <td className="num">{p.progressionPct} %</td>
                    {showMargin && <td className="num">{p.grossMarginPct} %</td>}
                    <td>{formatDate(p.deadline)}</td>
                    {showStatus && p.financialStatus && (
                      <td>
                        <span className={`badge-pill badge-${p.financialStatus}`}>{FINANCIAL_STATUS_LABELS[p.financialStatus]}</span>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {summary?.channelConversion && summary.channelConversion.length > 0 && (
        <div className="card" style={{ marginTop: 20 }}>
          <div className="card-band-header">
            <div>
              <h3 style={{ margin: 0 }}>Pipeline des demandes clients</h3>
              <p className="modal-subtitle">Demandes reçues et converties (budgétaire créé) par canal.</p>
            </div>
            <Link to="/rapports" className="btn btn-secondary btn-small">
              Ouvrir les rapports
            </Link>
          </div>
          <div className="channel-bar-list">
            {summary.channelConversion.map((channel) => (
              <div key={channel.salesChannelId} className="channel-bar-row">
                <div className="channel-bar-label">
                  <span>{channel.name}</span>
                  <span className="cell-sub">{channel.converted} / {channel.total} converties</span>
                </div>
                <div className="channel-bar-track">
                  <div className="channel-bar-fill" style={{ width: `${Math.min(100, channel.conversionPct)}%` }} />
                </div>
                <div className="channel-bar-pct">{channel.conversionPct}%</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {summary?.recentInvoices && summary.recentInvoices.length > 0 && (
        <div className="card" style={{ marginTop: 20 }}>
          <div className="card-band-header">
            <div>
              <h3 style={{ margin: 0 }}>Factures récemment envoyées</h3>
              <p className="modal-subtitle">Suivi manuel des paiements reçus au compte.</p>
            </div>
            <Link to="/facturation" className="btn btn-secondary btn-small">
              Ouvrir les comptes clients
            </Link>
          </div>
          <div className="table-scroll" style={{ marginTop: 10 }}>
            <table className="shortlist-table">
              <thead>
                <tr>
                  <th>Facture</th>
                  <th>Client / dossier</th>
                  <th>Envoyée</th>
                  <th>Échéance</th>
                  <th className="num">Montant</th>
                  <th className="num">Solde</th>
                  <th>Statut</th>
                </tr>
              </thead>
              <tbody>
                {summary.recentInvoices.map((entry) => (
                  <tr key={entry.id}>
                    <td>{entry.invoiceNumber}</td>
                    <td>
                      <div>{entry.clientLabel}</div>
                      <div className="cell-sub">{entry.sourceLabel}</div>
                    </td>
                    <td>{formatDate(entry.processedAt)}</td>
                    <td>{formatDate(entry.dueDate)}</td>
                    <td className="num">{formatCurrency(entry.amount)}</td>
                    <td className="num">{formatCurrency(entry.amount - entry.paidAmount)}</td>
                    <td>
                      <span className={`badge-pill ${INVOICE_STATUS_BADGE[entry.status as keyof typeof INVOICE_STATUS_BADGE]}`}>
                        {INVOICE_STATUS_LABELS[entry.status as keyof typeof INVOICE_STATUS_LABELS]}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {summary && summary.actionCenterItems.length > 0 && (
        <div className="card" style={{ marginTop: 20 }}>
          <div className="card-band-header">
            <div>
              <h3 style={{ margin: 0 }}>Centre d'actions</h3>
              <p className="modal-subtitle">Priorisé selon l'impact.</p>
            </div>
            <span className="badge-pill badge-critical">{summary.actionCenterCount} ouvert{summary.actionCenterCount > 1 ? "s" : ""}</span>
          </div>
          <div className="action-item-list">
            {summary.actionCenterItems.map((item) => (
              <Link key={item.id} to={linkFor(item)} className="action-item-row">
                <div style={{ display: "flex", alignItems: "center", gap: 12, minWidth: 0 }}>
                  <span className="action-item-icon">{ACTION_TYPE_ICON[item.type]}</span>
                  <div className="action-item-main">
                    <span className="action-item-label">{item.label}</span>
                    <span className="action-item-sublabel">{item.sublabel}</span>
                  </div>
                </div>
                <div className="action-item-side">
                  {item.amount !== undefined && <span className="action-item-amount">{formatCurrency(item.amount)}</span>}
                  <span className="action-item-date">{formatDate(item.createdAt)}</span>
                </div>
              </Link>
            ))}
          </div>
          <Link to="/centre-actions" className="btn btn-secondary" style={{ marginTop: 14, width: "100%" }}>
            Voir le centre complet
          </Link>
        </div>
      )}
    </div>
  );
}
