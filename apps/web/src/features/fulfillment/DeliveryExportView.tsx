import { useEffect } from "react";
import { useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "../../lib/auth/useAuth.js";
import { fetchDeliveryDetail } from "./api.js";

const STATUS_LABELS: Record<string, string> = { planned: "Planifiée", completed: "Complétée" };

function formatDate(iso: string | null): string {
  return iso ? new Date(iso).toLocaleDateString("fr-CA", { year: "numeric", month: "long", day: "numeric" }) : "—";
}

/**
 * Vue d'export PDF d'un bon de livraison (1er septembre 2026, demande de
 * l'utilisatrice). Même mécanisme que BudgetExportView.tsx/
 * ProjectPostMortemExportView.tsx — route autonome, window.print(), aucun
 * chiffre/donnée recalculé (fetchDeliveryDetail, même fonction que la vue
 * interactive DeliveryDetail.tsx). Toujours accessible, complétée ou non —
 * utile comme bon à faire signer avant livraison autant que comme preuve
 * de livraison une fois signée.
 */
export function DeliveryExportView() {
  const { id } = useParams<{ id: string }>();
  const { employee } = useAuth();
  const detailQuery = useQuery({
    queryKey: ["delivery", id],
    queryFn: () => fetchDeliveryDetail(id!),
    enabled: !!id,
  });
  const delivery = detailQuery.data?.delivery;

  useEffect(() => {
    if (!delivery) return;
    const timer = setTimeout(() => window.print(), 400);
    return () => clearTimeout(timer);
  }, [delivery]);

  if (!id) return null;
  if (!delivery) return <div style={{ padding: 40 }}>{detailQuery.isError ? "Livraison introuvable." : "Chargement…"}</div>;

  return (
    <div className="pdf-export">
      <button type="button" className="btn no-print" style={{ margin: 20 }} onClick={() => window.print()}>
        🖨️ Imprimer / Enregistrer en PDF
      </button>

      <div className="pdf-export-page">
        <header className="pdf-export-header">
          <div>
            <div className="pdf-export-brand">GSC Automation — Bon de livraison {delivery.displayId}</div>
            <p>
              <strong>Client :</strong> {delivery.company ?? delivery.contactName}
              {delivery.company ? <> ({delivery.contactName})</> : ""}
            </p>
            <p>
              <strong>Adresse :</strong> {delivery.address ?? "—"} &nbsp; <strong>Téléphone :</strong> {delivery.contactPhone ?? "—"}
            </p>
          </div>
          <div className="pdf-export-status">{STATUS_LABELS[delivery.status] ?? delivery.status}</div>
        </header>

        <div className="pdf-export-notes">
          <strong>Source</strong>
          <p>{delivery.sourceLabel}</p>
          <strong>Livreur</strong>
          <p>{delivery.driverEmployeeName ?? "Non assigné"}</p>
          <strong>Date planifiée</strong>
          <p>{formatDate(delivery.scheduledAt)}</p>
        </div>

        <section className="pdf-export-section">
          <h2>Marchandise à livrer</h2>
          <p style={{ border: "1px solid var(--gsc-color-line-strong)", borderRadius: 6, padding: 10, whiteSpace: "pre-wrap" }}>
            {delivery.items || "—"}
          </p>
        </section>

        {(delivery.kmTraveled !== null || delivery.conditionNote) && (
          <section className="pdf-export-section">
            <h2>Kilométrage et état</h2>
            <table>
              <thead>
                <tr>
                  <th>Kilométrage</th>
                  <th>Note d'état</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>{delivery.kmTraveled !== null ? `${delivery.kmTraveled} km` : "—"}</td>
                  <td>{delivery.conditionNote || "—"}</td>
                </tr>
              </tbody>
            </table>
          </section>
        )}

        <section className="pdf-export-section pdf-export-signature">
          <h2>Signature à la livraison</h2>
          {delivery.signatureCaptured && delivery.signatureImageUrl ? (
            <div>
              <img src={delivery.signatureImageUrl} alt="Signature du client" />
              {delivery.signatureSignerName && <p>Signé par {delivery.signatureSignerName}.</p>}
              {delivery.completedAt && <p>Livré le {formatDate(delivery.completedAt)}.</p>}
            </div>
          ) : (
            <p>Signature non capturée pour l'instant.</p>
          )}
        </section>

        <footer className="pdf-export-footer">
          Exporté le {formatDate(new Date().toISOString())}
          {employee && <> par {employee.name}</>} — GSC Pilot
        </footer>
      </div>
    </div>
  );
}
