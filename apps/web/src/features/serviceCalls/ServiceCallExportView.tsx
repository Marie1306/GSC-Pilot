import { useEffect } from "react";
import { useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "../../lib/auth/useAuth.js";
import { formatCalendarDate } from "../../lib/date.js";
import { fetchBonDeTravailDetail } from "./api.js";

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
function formatMeals(bt: { mealsBreakfastCount: number; mealsLunchCount: number; mealsDinnerCount: number }): string {
  const parts: string[] = [];
  if (bt.mealsBreakfastCount > 0) parts.push(`Déjeuner x${bt.mealsBreakfastCount}`);
  if (bt.mealsLunchCount > 0) parts.push(`Dîner x${bt.mealsLunchCount}`);
  if (bt.mealsDinnerCount > 0) parts.push(`Souper x${bt.mealsDinnerCount}`);
  return parts.length > 0 ? parts.join(", ") : "—";
}

/**
 * Vue d'export PDF d'un Bon de travail (Chantier D, 16 novembre 2026 —
 * remplace l'export par Call de service, aujourd'hui scopé au déplacement
 * précis, signé une fois par Bon de travail comme sur papier). Même
 * mécanisme que les autres vues d'export — route autonome, window.print(),
 * aucun chiffre recalculé (fetchBonDeTravailDetail, même fonction que
 * BonDeTravailDetail.tsx).
 *
 * Toujours imprimable/téléchargeable SANS PRIX, peu importe qui l'imprime
 * (confirmé explicitement par Marie, 16 novembre 2026) — contrairement à
 * l'ancienne vue (qui conditionnait les montants à canSeeServicePricing),
 * celle-ci n'affiche JAMAIS de prix : c'est le document physique qui peut
 * rester chez le client. Les prix restent visibles comme avant uniquement
 * à l'écran sur BonDeTravailDetail.tsx (canSeeServicePricing, inchangé).
 */
export function ServiceCallExportView() {
  const { id } = useParams<{ id: string }>();
  const { employee } = useAuth();
  const detailQuery = useQuery({
    queryKey: ["bon-de-travail", id],
    queryFn: () => fetchBonDeTravailDetail(id!),
    enabled: !!id,
  });
  const bt = detailQuery.data?.bonDeTravail;

  useEffect(() => {
    if (!bt) return;
    const timer = setTimeout(() => window.print(), 400);
    return () => clearTimeout(timer);
  }, [bt]);

  if (!id || !employee) return null;
  if (!bt) return <div style={{ padding: 40 }}>{detailQuery.isError ? "Bon de travail introuvable." : "Chargement…"}</div>;

  return (
    <div className="pdf-export">
      <button type="button" className="btn no-print" style={{ margin: 20 }} onClick={() => window.print()}>
        🖨️ Imprimer / Enregistrer en PDF
      </button>

      <div className="pdf-export-page">
        <header className="pdf-export-header">
          <div>
            <div className="pdf-export-brand">
              GSC Automation — Bon de travail {bt.displayId} — {bt.company ?? bt.contactName}
            </div>
            <p>
              <strong>Call de service :</strong> {bt.serviceCallDisplayId} — {bt.serviceCallTitle}
            </p>
            <p>
              <strong>Contact :</strong> {bt.contactName}
            </p>
          </div>
        </header>

        <div className="pdf-export-notes">
          <strong>Techniciens</strong>
          <p>{bt.assignedEmployees.length > 0 ? bt.assignedEmployees.map((e) => e.name).join(", ") : "—"}</p>
          <strong>Dates</strong>
          <p>
            Prévu : {formatDate(bt.scheduledAt)} &nbsp; Début : {formatDateTime(bt.startAt)} &nbsp; Fin : {formatDateTime(bt.endAt)}
          </p>
          {bt.summary && (
            <>
              <strong>Résumé</strong>
              <p>{bt.summary}</p>
            </>
          )}
        </div>

        {bt.parts.length > 0 && (
          <section className="pdf-export-section">
            <h2>Pièces utilisées</h2>
            <table>
              <thead>
                <tr>
                  <th>Pièce</th>
                  <th>Quantité</th>
                </tr>
              </thead>
              <tbody>
                {bt.parts.map((part) => (
                  <tr key={part.id}>
                    <td>{part.name}</td>
                    <td>
                      {part.qty} {part.unit ?? ""}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        )}

        {bt.timeEntries.length > 0 && (
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
                {bt.timeEntries.map((entry) => (
                  <tr key={entry.id}>
                    <td>{formatCalendarDate(entry.date)}</td>
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
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>{bt.kmTraveled !== null ? `${bt.kmTraveled} km` : "—"}</td>
                <td>{formatMeals(bt)}</td>
                <td>{formatHours(bt.totals.laborHours * 60)}</td>
              </tr>
            </tbody>
          </table>
        </section>

        <section className="pdf-export-section pdf-export-signature">
          <h2>Signature du client</h2>
          {bt.signatureCaptured && bt.signatureImageUrl ? (
            <div>
              <img src={bt.signatureImageUrl} alt="Signature du client" />
              {bt.signatureSignerName && <p>Signé par {bt.signatureSignerName}.</p>}
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
