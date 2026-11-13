/**
 * GSC Pilot — Trésorerie (nouveau module, 13 novembre 2026)
 *
 * Prévisionnel de flux de trésorerie, 13 semaines par défaut / 6 mois
 * modifiable. Combine 3 sources d'événements datés (factures confirmées —
 * échéance ou date de paiement réel si déjà payée, « ré-bascule »
 * automatique demandée explicitement par l'utilisatrice — dépenses
 * récurrentes, entrées ponctuelles) puis applique la bascule bidirectionnelle
 * chèque/marge de crédit par tranches de 20 000$ (confirmé), semaine par
 * semaine. Résolution "quelle date utiliser pour une facture" (payée vs
 * échéance) reste côté appelant (treasury/service.ts) — ce fichier reste de
 * la logique pure, sans Prisma.
 *
 * startOfWeek promue depuis dashboard/service.ts (copie privée retirée,
 * devenue partagée puisque désormais utilisée par 2 modules) — corps
 * inchangé.
 */

function round2(value: number): number {
  return Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100;
}

/** Lundi de la semaine courante (semaine québécoise lun-dim) — affichage seulement, jamais une règle de paie. */
export function startOfWeek(date: Date): Date {
  const day = date.getDay(); // 0 = dimanche
  const diff = (day === 0 ? -6 : 1) - day;
  const monday = new Date(date);
  monday.setDate(date.getDate() + diff);
  monday.setHours(0, 0, 0, 0);
  return monday;
}

function addDays(date: Date, days: number): Date {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}

export interface WeekBucket {
  weekStart: Date;
  weekEnd: Date;
}

/** weekCount semaines consécutives (lun-dim) à partir de la semaine de startDate. */
export function buildWeekBuckets(startDate: Date, weekCount: number): WeekBucket[] {
  const firstMonday = startOfWeek(startDate);
  const buckets: WeekBucket[] = [];
  for (let i = 0; i < weekCount; i++) {
    const weekStart = addDays(firstMonday, i * 7);
    buckets.push({ weekStart, weekEnd: addDays(weekStart, 6) });
  }
  return buckets;
}

export type LocSweepDirection = "draw" | "repay";
export interface LocSweepStep {
  direction: LocSweepDirection;
  amount: number;
}
export interface LocSweepResult {
  sweeps: LocSweepStep[];
  finalChecking: number;
  finalLocOwed: number;
}

/**
 * Bascule bidirectionnelle chèque/marge de crédit — confirmé par
 * l'utilisatrice : toujours par tranches exactes de `threshold` (20 000$),
 * répétées tant que nécessaire, dans les deux sens.
 *
 * Asymétrie volontaire entre les deux sens (jamais mentionnée explicitement
 * par l'utilisatrice, mais déduite du bon sens comptable — à confirmer avec
 * elle si une marge de crédit peut réellement afficher un solde créditeur) :
 * - Déficit (chèque < 0) : la marge injecte toujours des tranches PLEINES de
 *   `threshold`, même si la dernière dépasse le déficit réel — le chèque
 *   peut donc finir au-dessus de 0, comportement voulu (« jusqu'à solde ≥ 0 »).
 * - Surplus (chèque > threshold ET marge encore due) : le chèque rembourse
 *   des tranches de `threshold`, SAUF la dernière, plafonnée au solde
 *   réellement dû — une marge de crédit ne peut pas afficher un solde
 *   créditeur négatif, contrairement à un compte chèque.
 */
export function computeLocSweep(checkingBalance: number, locOwed: number, threshold: number): LocSweepResult {
  const sweeps: LocSweepStep[] = [];
  let checking = checkingBalance;
  let owed = locOwed;

  while (checking < 0) {
    checking = round2(checking + threshold);
    owed = round2(owed + threshold);
    sweeps.push({ direction: "draw", amount: threshold });
  }

  while (checking > threshold && owed > 0) {
    const amount = Math.min(threshold, owed);
    checking = round2(checking - amount);
    owed = round2(owed - amount);
    sweeps.push({ direction: "repay", amount });
  }

  return { sweeps, finalChecking: checking, finalLocOwed: owed };
}

export interface RecurringExpenseLike {
  dayOfMonth: number;
  defaultAmount: number;
}
export interface RecurringExpenseOverrideLike {
  yearMonth: string; // "2026-12"
  amount: number;
}
export interface RecurringOccurrence {
  date: Date;
  amount: number;
}

function lastDayOfMonth(year: number, monthIndex0: number): number {
  return new Date(year, monthIndex0 + 1, 0).getDate();
}
function yearMonthKey(year: number, monthIndex0: number): string {
  return `${year}-${String(monthIndex0 + 1).padStart(2, "0")}`;
}

/**
 * Expand une dépense récurrente en occurrences datées sur [rangeStart,
 * rangeEnd] inclus. dayOfMonth clampé au dernier jour du mois quand le mois
 * en a moins (ex. 31 en février → 28 ou 29). Un override pour le mois exact
 * remplace defaultAmount pour cette seule occurrence, jamais les autres.
 */
export function resolveRecurringOccurrences(
  expense: RecurringExpenseLike,
  overrides: RecurringExpenseOverrideLike[],
  rangeStart: Date,
  rangeEnd: Date,
): RecurringOccurrence[] {
  const overrideByMonth = new Map(overrides.map((o) => [o.yearMonth, o.amount]));
  const occurrences: RecurringOccurrence[] = [];
  const cursor = new Date(rangeStart.getFullYear(), rangeStart.getMonth(), 1);
  const end = new Date(rangeEnd.getFullYear(), rangeEnd.getMonth(), 1);

  while (cursor <= end) {
    const year = cursor.getFullYear();
    const monthIndex0 = cursor.getMonth();
    const day = Math.min(expense.dayOfMonth, lastDayOfMonth(year, monthIndex0));
    const occurrenceDate = new Date(year, monthIndex0, day);
    if (occurrenceDate >= rangeStart && occurrenceDate <= rangeEnd) {
      const amount = overrideByMonth.get(yearMonthKey(year, monthIndex0)) ?? expense.defaultAmount;
      occurrences.push({ date: occurrenceDate, amount });
    }
    cursor.setMonth(cursor.getMonth() + 1);
  }

  return occurrences;
}

export interface ConfirmedInvoiceEvent {
  date: Date; // paidAt si déjà payée, sinon dueDate — résolu par l'appelant
  amount: number;
  invoiceNumber: string;
  sourceLabel: string;
  clientLabel: string;
}
export interface DatedAmount {
  date: Date;
  amount: number;
  label: string;
}

export interface ForecastWeekRow {
  weekStart: string; // ISO date (YYYY-MM-DD)
  weekEnd: string;
  invoiceTotal: number;
  invoiceDetails: ConfirmedInvoiceEvent[];
  recurringTotal: number;
  manualTotal: number;
  checkingBalanceBeforeSweep: number;
  sweeps: LocSweepStep[];
  checkingBalance: number;
  locOwed: number;
}

export interface BuildForecastTableParams {
  weekCount: number;
  anchorDate: Date; // "aujourd'hui" — aucun événement avant cette date n'est appliqué, le solde d'ouverture en tient déjà compte
  checkingOpeningBalance: number;
  locOpeningBalance: number;
  sweepThreshold: number;
  confirmedInvoices: ConfirmedInvoiceEvent[];
  recurringOccurrences: RecurringOccurrence[];
  manualEntries: DatedAmount[];
}

function isoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/**
 * Orchestrateur principal — construit le tableau semaine par semaine avec
 * soldes courants des deux comptes. Chaque semaine : les 3 sources
 * d'événements dont la date tombe dans la semaine s'additionnent au solde
 * chèque, PUIS la bascule (computeLocSweep) s'applique avant de passer à la
 * semaine suivante — jamais l'inverse (la bascule d'une semaine ne doit pas
 * anticiper les mouvements de la semaine suivante).
 */
export function buildForecastTable(params: BuildForecastTableParams): ForecastWeekRow[] {
  const buckets = buildWeekBuckets(params.anchorDate, params.weekCount);
  const rows: ForecastWeekRow[] = [];
  let checking = params.checkingOpeningBalance;
  let owed = params.locOpeningBalance;

  for (const bucket of buckets) {
    const inBucket = (date: Date) => date >= bucket.weekStart && date <= bucket.weekEnd && date >= params.anchorDate;

    const invoiceDetails = params.confirmedInvoices.filter((e) => inBucket(e.date));
    const invoiceTotal = round2(invoiceDetails.reduce((sum, e) => sum + e.amount, 0));
    const recurringTotal = round2(params.recurringOccurrences.filter((o) => inBucket(o.date)).reduce((sum, o) => sum + o.amount, 0));
    const manualTotal = round2(params.manualEntries.filter((m) => inBucket(m.date)).reduce((sum, m) => sum + m.amount, 0));

    checking = round2(checking + invoiceTotal + recurringTotal + manualTotal);
    const checkingBalanceBeforeSweep = checking;

    const sweep = computeLocSweep(checking, owed, params.sweepThreshold);
    checking = sweep.finalChecking;
    owed = sweep.finalLocOwed;

    rows.push({
      weekStart: isoDate(bucket.weekStart),
      weekEnd: isoDate(bucket.weekEnd),
      invoiceTotal,
      invoiceDetails,
      recurringTotal,
      manualTotal,
      checkingBalanceBeforeSweep,
      sweeps: sweep.sweeps,
      checkingBalance: checking,
      locOwed: owed,
    });
  }

  return rows;
}
