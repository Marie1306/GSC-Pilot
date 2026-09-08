/**
 * Formate une date-calendrier pure (colonnes Prisma @db.Date — TimeEntry.date,
 * ProjectPurchaseEntry.date, PurchaseRequest.expectedReceiptDate,
 * DelegationGrant.startDate/endDate, Interruption.date — jamais un vrai
 * timestamp). Ces champs arrivent du serveur ancrés à minuit UTC ; les
 * reformater via `new Date(iso).toLocaleDateString(...)` sans ancrage
 * explicite les décale d'un jour en arrière dans un fuseau nord-américain
 * (minuit UTC = 20h la veille à Toronto en heure d'été) — bogue réel
 * rapporté le 8 sept. 2026 (entrée manuelle du jour affichée le 7).
 * Ancrer à midi HEURE LOCALE (aucun "Z"/décalage dans la chaîne construite
 * ci-dessous) élimine le problème : l'analyse et le formatage se font dans
 * le même fuseau, sans conversion intermédiaire.
 */
export function formatCalendarDate(
  value: string,
  options: Intl.DateTimeFormatOptions = { year: "numeric", month: "short", day: "numeric" },
): string {
  const datePart = value.slice(0, 10);
  return new Date(`${datePart}T12:00:00`).toLocaleDateString("fr-CA", options);
}
