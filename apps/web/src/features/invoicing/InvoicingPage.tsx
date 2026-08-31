import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { fetchInvoiceEntries, formatCurrency, INVOICE_STATUS_LABELS, INVOICE_STATUS_BADGE, type InvoiceEntryStatus } from "./api.js";
import { InvoiceDetailDrawer } from "./InvoiceDetailDrawer.js";
import "./invoicing.css";

function formatDate(iso: string | null): string {
  return iso ? new Date(iso).toLocaleDateString("fr-CA", { year: "numeric", month: "short", day: "numeric" }) : "—";
}

const TABS: { key: InvoiceEntryStatus | "all"; label: string }[] = [
  { key: "all", label: "Toutes" },
  { key: "sent", label: "Envoyées" },
  { key: "overdue", label: "En retard" },
  { key: "on_hold", label: "En suspens" },
  { key: "paid", label: "Payées" },
];

/**
 * Facturation — vue consolidée (20 août 2026, sur demande explicite de
 * l'utilisatrice). Regroupe les jalons de projet déjà demandés et les
 * appels de service envoyés à l'administration (voir invoicing/service.ts,
 * backend) — un jalon jamais demandé n'apparaît jamais ici, seulement dans
 * le Cycle de facturation du projet lui-même (comportement voulu). Suivi
 * manuel — Sage reste la source réelle de la facture, jamais générée ici.
 *
 * Sélectionner une ligne ouvre le détail en tiroir latéral droit (31 août
 * 2026, demande explicite de l'utilisatrice, mise en page inspirée de v19)
 * — remplace l'ancien accordéon en ligne. Voir InvoiceDetailDrawer.tsx pour
 * les tuiles/échéancier/fenêtre de paiement.
 */
export function InvoicingPage() {
  const entriesQuery = useQuery({ queryKey: ["invoicing", "entries"], queryFn: fetchInvoiceEntries });
  const [tab, setTab] = useState<InvoiceEntryStatus | "all">("all");
  const [search, setSearch] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);

  const entries = entriesQuery.data?.entries ?? [];

  const stats = { open: 0, openBalance: 0, overdue: 0, onHold: 0, received: 0 };
  for (const entry of entries) {
    const balance = entry.amount - entry.paidAmount;
    stats.received += entry.paidAmount;
    if (entry.status !== "paid") {
      stats.open += entry.amount;
      stats.openBalance += balance;
    }
    if (entry.status === "overdue") stats.overdue += balance;
    if (entry.status === "on_hold") stats.onHold += balance;
  }

  const filtered = entries.filter((entry) => {
    if (tab !== "all" && entry.status !== tab) return false;
    if (!search.trim()) return true;
    const needle = search.trim().toLowerCase();
    return (
      (entry.invoiceNumber ?? "").toLowerCase().includes(needle) ||
      entry.clientLabel.toLowerCase().includes(needle) ||
      entry.sourceLabel.toLowerCase().includes(needle)
    );
  });

  return (
    <div>
      <div className="stat-tile-grid">
        <div className="stat-tile">
          <span className="stat-tile-label">Facture ouverte</span>
          <span className="stat-tile-value">{formatCurrency(stats.open)}</span>
        </div>
        <div className="stat-tile">
          <span className="stat-tile-label">Solde à recevoir</span>
          <span className="stat-tile-value">{formatCurrency(stats.openBalance)}</span>
        </div>
        <div className="stat-tile">
          <span className="stat-tile-label">En retard</span>
          <span className="stat-tile-value" style={{ color: "var(--gsc-color-danger)" }}>
            {formatCurrency(stats.overdue)}
          </span>
        </div>
        <div className="stat-tile">
          <span className="stat-tile-label">En suspens</span>
          <span className="stat-tile-value">{formatCurrency(stats.onHold)}</span>
        </div>
        <div className="stat-tile">
          <span className="stat-tile-label">Reçu</span>
          <span className="stat-tile-value" style={{ color: "var(--gsc-color-green)" }}>
            {formatCurrency(stats.received)}
          </span>
        </div>
      </div>

      <div className="card" style={{ marginTop: 16 }}>
        <div className="card-band-header">
          <h3>Facturation</h3>
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap", marginBottom: 14 }}>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {TABS.map((t) => (
              <button
                key={t.key}
                type="button"
                className={tab === t.key ? "btn btn-small" : "btn btn-secondary btn-small"}
                onClick={() => setTab(t.key)}
              >
                {t.label}
              </button>
            ))}
          </div>
          <input placeholder="Facture ou client…" value={search} onChange={(event) => setSearch(event.target.value)} style={{ maxWidth: 220 }} />
        </div>

        {entriesQuery.isError ? (
          <p className="form-error">Impossible de charger la facturation.</p>
        ) : filtered.length === 0 ? (
          <p style={{ color: "var(--gsc-color-muted)", fontSize: 13 }}>Aucune facture pour ce filtre.</p>
        ) : (
          <div className="table-scroll">
            <table className="shortlist-table">
              <thead>
                <tr>
                  <th>Facture</th>
                  <th>Client / dossier</th>
                  <th>Envoyée</th>
                  <th>Échéance</th>
                  <th className="num">Montant</th>
                  <th className="num">Payé</th>
                  <th className="num">Solde</th>
                  <th>Statut</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((entry) => (
                  <tr key={entry.id} className="clickable-row" onClick={() => setOpenId(entry.id)}>
                    <td>{entry.invoiceNumber ?? "—"}</td>
                    <td>
                      <div>{entry.clientLabel}</div>
                      <div className="cell-sub">{entry.sourceLabel}</div>
                    </td>
                    <td>{formatDate(entry.processedAt)}</td>
                    <td>{formatDate(entry.dueDate)}</td>
                    <td className="num">{formatCurrency(entry.amount)}</td>
                    <td className="num">{formatCurrency(entry.paidAmount)}</td>
                    <td className="num">{formatCurrency(entry.amount - entry.paidAmount)}</td>
                    <td>
                      <span className={`badge-pill ${INVOICE_STATUS_BADGE[entry.status]}`}>{INVOICE_STATUS_LABELS[entry.status]}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {openId && <InvoiceDetailDrawer id={openId} onClose={() => setOpenId(null)} />}
    </div>
  );
}
