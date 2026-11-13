/**
 * GSC Pilot — Trésorerie (nouveau module, 13 novembre 2026)
 *
 * Prévisionnel de flux de trésorerie, 13 semaines par défaut / 6 mois
 * modifiable. Combine 3 sources d'événements datés (factures confirmées —
 * échéance ou date de paiement réel si déjà payée, « ré-bascule »
 * automatique demandée explicitement par l'utilisatrice — dépenses
 * récurrentes mensuelles OU hebdomadaires [ex. salaires], entrées
 * ponctuelles) puis applique la bascule bidirectionnelle chèque/marge de
 * crédit par tranches de 20 000$ plafonnées (seuil de bascule ET plafond de
 * la marge elle-même, confirmés), semaine par semaine. Résolution "quelle
 * date utiliser pour une facture" (payée vs échéance) reste côté appelant
 * (treasury/service.ts) — ce fichier reste de la logique pure, sans Prisma.
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
 * répétées tant que nécessaire, dans les deux sens, avec deux plafonds
 * confirmés explicitement le 13 novembre 2026 :
 * - Déficit (chèque < 0) : la marge injecte des tranches de `threshold`,
 *   jusqu'à solde chèque ≥ 0 OU jusqu'à ce que la marge atteigne
 *   `locCreditLimit` (200 000$ confirmé) — la DERNIÈRE tranche est alors
 *   plafonnée pour ne jamais dépasser ce plafond (jamais une tranche pleine
 *   qui le ferait déborder). Si le plafond est atteint avant que le chèque
 *   remonte à 0, la bascule s'arrête là — le solde chèque reste négatif,
 *   signal qu'une intervention manuelle est nécessaire.
 * - Surplus (chèque > threshold ET marge encore due) : le chèque rembourse
 *   des tranches de `threshold`, SAUF la dernière, plafonnée au solde
 *   réellement dû — confirmé explicitement : « le solde dû de la marge ne
 *   peut jamais aller en dessous de 0$ ».
 */
export function computeLocSweep(checkingBalance: number, locOwed: number, threshold: number, locCreditLimit: number): LocSweepResult {
  const sweeps: LocSweepStep[] = [];
  let checking = checkingBalance;
  let owed = locOwed;

  while (checking < 0 && owed < locCreditLimit) {
    const amount = Math.min(threshold, round2(locCreditLimit - owed));
    checking = round2(checking + amount);
    owed = round2(owed + amount);
    sweeps.push({ direction: "draw", amount });
  }

  while (checking > threshold && owed > 0) {
    const amount = Math.min(threshold, owed);
    checking = round2(checking - amount);
    owed = round2(owed - amount);
    sweeps.push({ direction: "repay", amount });
  }

  return { sweeps, finalChecking: checking, finalLocOwed: owed };
}

/**
 * defaultAmount : TOUJOURS un montant positif (confirmé explicitement le 13
 * novembre 2026 — « une dépense récurrente est une sortie de fonds »), jamais
 * une convention de signe comme les Achats réels ou les entrées ponctuelles.
 * exactement un de dayOfMonth/dayOfWeek non nul selon frequency.
 */
export interface RecurringExpenseLike {
  label: string;
  frequency: "monthly" | "weekly";
  dayOfMonth: number | null;
  dayOfWeek: number | null; // 1=lundi..7=dimanche, même convention que startOfWeek
  defaultAmount: number;
}
export interface RecurringExpenseOverrideLike {
  yearMonth: string; // "2026-12" — mensuel seulement, jamais pour une dépense hebdomadaire (voir treasury/service.ts)
  amount: number;
}
export interface RecurringOccurrence {
  date: Date;
  amount: number; // toujours négatif (sortie) — signe déjà résolu ici, jamais au niveau de l'appelant
  label: string;
}

function lastDayOfMonth(year: number, monthIndex0: number): number {
  return new Date(year, monthIndex0 + 1, 0).getDate();
}
function yearMonthKey(year: number, monthIndex0: number): string {
  return `${year}-${String(monthIndex0 + 1).padStart(2, "0")}`;
}

function resolveWeeklyOccurrences(dayOfWeek: number, amount: number, label: string, rangeStart: Date, rangeEnd: Date): RecurringOccurrence[] {
  const occurrences: RecurringOccurrence[] = [];
  const jsTargetDay = dayOfWeek % 7; // ISO 1..7 (lun..dim) -> JS Date#getDay() 0..6 (dim..sam) ; 7 % 7 = 0 (dimanche)
  const cursor = new Date(rangeStart);
  while (cursor.getDay() !== jsTargetDay) cursor.setDate(cursor.getDate() + 1);
  while (cursor <= rangeEnd) {
    occurrences.push({ date: new Date(cursor), amount, label });
    cursor.setDate(cursor.getDate() + 7);
  }
  return occurrences;
}

/**
 * Expand une dépense récurrente en occurrences datées sur [rangeStart,
 * rangeEnd] inclus. Fréquence "monthly" : dayOfMonth clampé au dernier jour
 * du mois quand le mois en a moins (ex. 31 en février → 28 ou 29, confirmé) ;
 * un override pour le mois exact remplace defaultAmount pour cette seule
 * occurrence, jamais les autres. Fréquence "weekly" (ex. salaires, 13
 * novembre 2026) : une occurrence chaque semaine au jour choisi, jamais
 * d'override (non demandé — voir treasury/service.ts, bloqué côté serveur).
 */
export function resolveRecurringOccurrences(
  expense: RecurringExpenseLike,
  overrides: RecurringExpenseOverrideLike[],
  rangeStart: Date,
  rangeEnd: Date,
): RecurringOccurrence[] {
  if (expense.frequency === "weekly") {
    if (expense.dayOfWeek == null) return [];
    return resolveWeeklyOccurrences(expense.dayOfWeek, -Math.abs(expense.defaultAmount), expense.label, rangeStart, rangeEnd);
  }
  if (expense.dayOfMonth == null) return [];

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
      const magnitude = overrideByMonth.get(yearMonthKey(year, monthIndex0)) ?? expense.defaultAmount;
      occurrences.push({ date: occurrenceDate, amount: -Math.abs(magnitude), label: expense.label });
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

export interface LabeledAmount {
  label: string;
  amount: number;
}

export interface ForecastWeekRow {
  weekStart: string; // ISO date (YYYY-MM-DD)
  weekEnd: string;
  invoiceTotal: number;
  invoiceDetails: ConfirmedInvoiceEvent[];
  recurringTotal: number;
  recurringDetails: LabeledAmount[];
  manualTotal: number;
  manualDetails: LabeledAmount[];
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
  locCreditLimit: number;
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
    const recurringInBucket = params.recurringOccurrences.filter((o) => inBucket(o.date));
    const recurringTotal = round2(recurringInBucket.reduce((sum, o) => sum + o.amount, 0));
    const manualInBucket = params.manualEntries.filter((m) => inBucket(m.date));
    const manualTotal = round2(manualInBucket.reduce((sum, m) => sum + m.amount, 0));

    checking = round2(checking + invoiceTotal + recurringTotal + manualTotal);
    const checkingBalanceBeforeSweep = checking;

    const sweep = computeLocSweep(checking, owed, params.sweepThreshold, params.locCreditLimit);
    checking = sweep.finalChecking;
    owed = sweep.finalLocOwed;

    rows.push({
      weekStart: isoDate(bucket.weekStart),
      weekEnd: isoDate(bucket.weekEnd),
      invoiceTotal,
      invoiceDetails,
      recurringTotal,
      recurringDetails: recurringInBucket.map((o) => ({ label: o.label, amount: o.amount })),
      manualTotal,
      manualDetails: manualInBucket.map((m) => ({ label: m.label, amount: m.amount })),
      checkingBalanceBeforeSweep,
      sweeps: sweep.sweeps,
      checkingBalance: checking,
      locOwed: owed,
    });
  }

  return rows;
}
