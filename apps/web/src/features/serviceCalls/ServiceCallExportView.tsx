import { useEffect } from "react";
import { useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { canSeeServicePricing } from "@gsc-pilot/business-rules";
import { useAuth } from "../../lib/auth/useAuth.js";
import { fetchServiceCallDetail, MEAL_LABELS } from "./api.js";

const STATUS_LABELS: Record<string, string> = {
  pending: "En attente",
  in_progress: "En cours",
  approved: "Approuvé",
  sent_to_admin: "Envoyé à l'administration",
};

function formatDate(iso: string | null): string {
  return iso ? new Date(iso).toLocaleDateString("fr-CA", { year: "numeric", month: "long", day: "numeric" }) : "—";
}
function formatDateTime(iso: string | null): string {
  return iso ? new Date(iso).toLocaleString("fr-CA", { year: "numeric", month: "long", day: "numeric", hour: "2-digit", minute: "2-digit" }) : "—";
}
function formatHours(minutes: number | null): string {
  if (minutes === null) return "—";
  return `${Math.floor(minutes / 60)}h${String(minutes % 60).padStart(2, "0")}`;
}
function formatCurrency(value: number): string {
  return new Intl.NumberFormat("fr-CA", { style: "currency", currency: "CAD" }).format(value);
}

/**
 * Vue d'export PDF d'un call de service (1er septembre 2026, demande de
 * l'utilisatrice). Même mécanisme que les autres vues d'export — route
 * autonome, window.print(), aucun chiffre recalculé (fetchServiceCallDetail,
 * même fonction que ServiceCallDetail.tsx). showFinancials reprend
 * exactement canSeeServicePricing(employee.persona) — même garde que la vue
 * interactive, jamais assumé que canAccessServiceCalls (qui gate déjà cette
 * route) suffit à voir les prix : un Employé atteint cette page mais ne
 * doit jamais y voir de montant.
 */
export function ServiceCallExportView() {
  const { id } = useParams<{ id: string }>();
  const { employee } = useAuth();
  const detailQuery = useQuery({
    queryKey: ["service-call", id],
    queryFn: () => fetchServiceCallDetail(id!),
    enabled: !!id,
  });
  const call = detailQuery.data?.serviceCall;

  useEffect(() => {
    if (!call) return;
    const timer = setTimeout(() => window.print(), 400);
    return () => clearTimeout(timer);
  }, [call]);

  if (!id || !employee) return null;
  if (!call) return <div style={{ padding: 40 }}>{detailQuery.isError ? "Call de service introuvable." : "Chargement…"}</div>;

  const showFinancials = canSeeServicePricing(employee.persona);

  return (
    <div className="pdf-export">
      <button type="button" className="btn no-print" style={{ margin: 20 }} onClick={() => window.print()}>
        🖨️ Imprimer / Enregistrer en PDF
      </button>

      <div className="pdf-export-page">
        <header className="pdf-export-header">
          <div>
            <div className="pdf-export-brand">
              GSC Automation — Appel de service {call.displayId} — {call.company ?? call.contactName}
            </div>
            <p>
              <strong>Contact :</strong> {call.contactName} &nbsp; <strong>Téléphone :</strong> {call.contactPhone ?? "—"} &nbsp;{" "}
              <strong>Courriel :</strong> {call.contactEmail ?? "—"}
            </p>
            <p>
              <strong>Adresse :</strong> {call.address ?? "—"}
            </p>
          </div>
          <div className="pdf-export-status">{STATUS_LABELS[call.status] ?? call.status}</div>
        </header>

        <div className="pdf-export-notes">
          <strong>Titre</strong>
          <p>{call.title}</p>
          <strong>Demande</strong>
          <p>{call.request}</p>
          <strong>Techniciens assignés</strong>
          <p>{call.assignedEmployees.length > 0 ? call.assignedEmployees.map((e) => e.name).join(", ") : "—"}</p>
          <strong>Dates</strong>
          <p>
            Prévu : {formatDate(call.scheduledAt)} &nbsp; Début : {formatDateTime(call.startAt)} &nbsp; Fin : {formatDateTime(call.endAt)}
          </p>
          {call.summary && (
            <>
              <strong>Résumé</strong>
              <p>{call.summary}</p>
            </>
          )}
        </div>

        {call.parts.length > 0 && (
          <section className="pdf-export-section">
            <h2>Pièces utilisées</h2>
            <table>
              <thead>
                <tr>
                  <th>Pièce</th>
                  <th>Quantité</th>
                  {showFinancials && (
                    <>
                      <th>Coût unitaire</th>
                      <th>Prix unitaire</th>
                    </>
                  )}
                </tr>
              </thead>
              <tbody>
                {call.parts.map((part) => (
                  <tr key={part.id}>
                    <td>{part.name}</td>
                    <td>
                      {part.qty} {part.unit ?? ""}
                    </td>
                    {showFinancials && (
                      <>
                        <td>{part.costPerUnit !== null ? formatCurrency(part.costPerUnit) : "—"}</td>
                        <td>{part.salePricePerUnit !== null ? formatCurrency(part.salePricePerUnit) : "—"}</td>
                      </>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        )}

        {call.timeEntries.length > 0 && (
          <section className="pdf-export-section">
            <h2>Temps consigné</h2>
            <table>
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Employé</th>
                  <th>Tâche</th>
                  <th>Durée</th>
                </tr>
              </thead>
              <tbody>
                {call.timeEntries.map((entry) => (
                  <tr key={entry.id}>
                    <td>{formatDate(entry.date)}</td>
                    <td>{entry.employeeName}</td>
                    <td>{entry.taskLabel ?? "—"}</td>
                    <td>{formatHours(entry.roundedMinutes)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        )}

        <section className="pdf-export-section">
          <h2>Totaux</h2>
          <table>
            <thead>
              <tr>
                <th>Kilométrage</th>
                <th>Repas réclamés</th>
                <th>Heures de main-d'oeuvre</th>
                {showFinancials && <th>Total facturable</th>}
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>{call.kmTraveled !== null ? `${call.kmTraveled} km` : "—"}</td>
                <td>{call.mealsClaimed.length > 0 ? call.mealsClaimed.map((m) => MEAL_LABELS[m] ?? m).join(", ") : "—"}</td>
                <td>{formatHours(call.totals.laborHours * 60)}</td>
                {showFinancials && <td>{call.totals.totalSale !== undefined ? formatCurrency(call.totals.totalSale) : "—"}</td>}
              </tr>
            </tbody>
          </table>
        </section>

        <section className="pdf-export-section pdf-export-signature">
          <h2>Signature du client</h2>
          {call.signatureCaptured && call.signatureImageUrl ? (
            <div>
              <img src={call.signatureImageUrl} alt="Signature du client" />
              {call.signatureSignerName && <p>Signé par {call.signatureSignerName}.</p>}
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
