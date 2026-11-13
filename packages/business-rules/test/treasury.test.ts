import { describe, it, expect } from "vitest";
import { startOfWeek, buildWeekBuckets, computeLocSweep, resolveRecurringOccurrences, buildForecastTable } from "../src/treasury.js";

const LOC_CEILING = 200000;

describe("startOfWeek (lundi, semaine québécoise)", () => {
  it("un mercredi recule au lundi de la même semaine", () => {
    expect(startOfWeek(new Date("2026-11-11T15:00:00")).toISOString().slice(0, 10)).toBe("2026-11-09");
  });
  it("un dimanche recule au lundi précédent (pas au lundi suivant)", () => {
    expect(startOfWeek(new Date("2026-11-15T10:00:00")).toISOString().slice(0, 10)).toBe("2026-11-09");
  });
});

describe("buildWeekBuckets", () => {
  it("13 semaines consécutives, chacune lun-dim", () => {
    const buckets = buildWeekBuckets(new Date("2026-11-11"), 13);
    expect(buckets).toHaveLength(13);
    expect(buckets[0]!.weekStart.toISOString().slice(0, 10)).toBe("2026-11-09");
    expect(buckets[0]!.weekEnd.toISOString().slice(0, 10)).toBe("2026-11-15");
    expect(buckets[1]!.weekStart.toISOString().slice(0, 10)).toBe("2026-11-16");
    expect(buckets[12]!.weekStart.toISOString().slice(0, 10)).toBe("2027-02-01");
  });
});

describe("computeLocSweep — bascule chèque/marge de crédit par tranches de 20 000$ (confirmé)", () => {
  it("aucune bascule si le chèque est entre 0 et le seuil", () => {
    const result = computeLocSweep(5000, 0, 20000, LOC_CEILING);
    expect(result.sweeps).toHaveLength(0);
    expect(result.finalChecking).toBe(5000);
  });
  it("déficit de 1 398$ : une seule tranche de 20 000$ suffit", () => {
    const result = computeLocSweep(-1398, 0, 20000, LOC_CEILING);
    expect(result.sweeps).toEqual([{ direction: "draw", amount: 20000 }]);
    expect(result.finalChecking).toBe(18602);
    expect(result.finalLocOwed).toBe(20000);
  });
  it("déficit de 35 000$ : deux tranches de 20 000$ (jamais une seule, jamais exactement 35 000$)", () => {
    const result = computeLocSweep(-35000, 0, 20000, LOC_CEILING);
    expect(result.sweeps).toEqual([
      { direction: "draw", amount: 20000 },
      { direction: "draw", amount: 20000 },
    ]);
    expect(result.finalChecking).toBe(5000);
    expect(result.finalLocOwed).toBe(40000);
  });
  it("surplus de 25 000$ avec 20 000$ dus : une tranche pleine ramène le chèque sous le seuil et la marge à 0", () => {
    const result = computeLocSweep(25000, 20000, 20000, LOC_CEILING);
    expect(result.sweeps).toEqual([{ direction: "repay", amount: 20000 }]);
    expect(result.finalChecking).toBe(5000);
    expect(result.finalLocOwed).toBe(0);
  });
  it("surplus de 30 000$ avec seulement 8 000$ dus : la tranche est plafonnée au solde dû, jamais un crédit sur la marge", () => {
    const result = computeLocSweep(30000, 8000, 20000, LOC_CEILING);
    expect(result.sweeps).toEqual([{ direction: "repay", amount: 8000 }]);
    expect(result.finalChecking).toBe(22000);
    expect(result.finalLocOwed).toBe(0);
  });
  it("surplus au-dessus du seuil mais marge déjà remboursée : aucune bascule", () => {
    const result = computeLocSweep(25000, 0, 20000, LOC_CEILING);
    expect(result.sweeps).toHaveLength(0);
    expect(result.finalChecking).toBe(25000);
  });
  it("plafond de la marge (200 000$, confirmé) : la dernière tranche s'ajuste pour ne jamais le dépasser", () => {
    const result = computeLocSweep(-15000, 190000, 20000, LOC_CEILING);
    expect(result.sweeps).toEqual([{ direction: "draw", amount: 10000 }]);
    expect(result.finalLocOwed).toBe(200000);
    expect(result.finalChecking).toBe(-5000);
  });
  it("marge déjà au plafond : la bascule cesse, le chèque reste négatif (confirmé — intervention manuelle requise)", () => {
    const result = computeLocSweep(-5000, 200000, 20000, LOC_CEILING);
    expect(result.sweeps).toHaveLength(0);
    expect(result.finalChecking).toBe(-5000);
    expect(result.finalLocOwed).toBe(200000);
  });
});

describe("resolveRecurringOccurrences — mensuel", () => {
  it("une occurrence par mois, au jour demandé — montant toujours négatif même saisi positif (confirmé : une dépense récurrente est toujours une sortie)", () => {
    const occurrences = resolveRecurringOccurrences(
      { label: "Loyer", frequency: "monthly", dayOfMonth: 15, dayOfWeek: null, defaultAmount: 1200 },
      [],
      new Date("2026-11-01"),
      new Date("2027-01-31"),
    );
    expect(occurrences.map((o) => o.date.toISOString().slice(0, 10))).toEqual(["2026-11-15", "2026-12-15", "2027-01-15"]);
    expect(occurrences.every((o) => o.amount === -1200)).toBe(true);
    expect(occurrences.every((o) => o.label === "Loyer")).toBe(true);
  });
  it("une saisie négative par erreur donne quand même -1200 (jamais +1200, la magnitude seule compte)", () => {
    const occurrences = resolveRecurringOccurrences(
      { label: "Loyer", frequency: "monthly", dayOfMonth: 15, dayOfWeek: null, defaultAmount: -1200 },
      [],
      new Date("2026-11-01"),
      new Date("2026-11-30"),
    );
    expect(occurrences[0]!.amount).toBe(-1200);
  });
  it("jour 31 clampé au dernier jour de février (28, année non bissextile, confirmé)", () => {
    const occurrences = resolveRecurringOccurrences(
      { label: "Test", frequency: "monthly", dayOfMonth: 31, dayOfWeek: null, defaultAmount: 500 },
      [],
      new Date("2027-02-01"),
      new Date("2027-02-28"),
    );
    expect(occurrences).toHaveLength(1);
    expect(occurrences[0]!.date.toISOString().slice(0, 10)).toBe("2027-02-28");
  });
  it("un override ne s'applique qu'au mois exact, jamais aux autres", () => {
    const occurrences = resolveRecurringOccurrences(
      { label: "Assurance", frequency: "monthly", dayOfMonth: 1, dayOfWeek: null, defaultAmount: 800 },
      [{ yearMonth: "2026-12", amount: 950 }],
      new Date("2026-11-01"),
      new Date("2027-01-31"),
    );
    expect(occurrences.map((o) => o.amount)).toEqual([-800, -950, -800]);
  });
});

describe("resolveRecurringOccurrences — hebdomadaire (ex. salaires, demandé explicitement)", () => {
  it("une occurrence chaque semaine, au jour demandé (vendredi = 5)", () => {
    const occurrences = resolveRecurringOccurrences(
      { label: "Salaires", frequency: "weekly", dayOfMonth: null, dayOfWeek: 5, defaultAmount: 8000 },
      [],
      new Date("2026-11-09"), // lundi
      new Date("2026-11-29"), // dimanche, 3 semaines plus tard
    );
    expect(occurrences.map((o) => o.date.toISOString().slice(0, 10))).toEqual(["2026-11-13", "2026-11-20", "2026-11-27"]);
    expect(occurrences.every((o) => o.amount === -8000)).toBe(true);
    expect(occurrences.every((o) => o.label === "Salaires")).toBe(true);
  });
  it("dimanche (7) fonctionne aussi, malgré la conversion ISO -> JS Date#getDay()", () => {
    const occurrences = resolveRecurringOccurrences(
      { label: "Test dimanche", frequency: "weekly", dayOfMonth: null, dayOfWeek: 7, defaultAmount: 100 },
      [],
      new Date("2026-11-09"),
      new Date("2026-11-15"),
    );
    expect(occurrences.map((o) => o.date.toISOString().slice(0, 10))).toEqual(["2026-11-15"]);
  });
});

describe("buildForecastTable — intégration", () => {
  it("une facture confirmée tombe dans sa semaine, le solde roule ensuite sur les semaines suivantes", () => {
    const rows = buildForecastTable({
      weekCount: 3,
      anchorDate: new Date("2026-11-09"),
      checkingOpeningBalance: 1000,
      locOpeningBalance: 0,
      sweepThreshold: 20000,
      locCreditLimit: LOC_CEILING,
      confirmedInvoices: [{ date: new Date("2026-11-12"), amount: 5000, invoiceNumber: "FA-2026-0001", sourceLabel: "2422", clientLabel: "Client X" }],
      recurringOccurrences: [],
      manualEntries: [],
    });
    expect(rows).toHaveLength(3);
    expect(rows[0]!.invoiceTotal).toBe(5000);
    expect(rows[0]!.checkingBalance).toBe(6000);
    expect(rows[1]!.invoiceTotal).toBe(0);
    expect(rows[1]!.checkingBalance).toBe(6000);
    expect(rows[2]!.checkingBalance).toBe(6000);
  });
  it("un paiement reçu avant l'échéance déplace le montant vers sa semaine réelle, jamais celle de l'échéance", () => {
    // Facture due le 30 septembre mais payée le 13 — l'appelant résout déjà
    // la date effective (paidAt) avant d'appeler buildForecastTable.
    const rows = buildForecastTable({
      weekCount: 4,
      anchorDate: new Date("2026-09-07"),
      checkingOpeningBalance: 0,
      locOpeningBalance: 0,
      sweepThreshold: 20000,
      locCreditLimit: LOC_CEILING,
      confirmedInvoices: [{ date: new Date("2026-09-13"), amount: 1000, invoiceNumber: "FA-2026-0002", sourceLabel: "2267", clientLabel: "Client Y" }],
      recurringOccurrences: [],
      manualEntries: [],
    });
    expect(rows[0]!.invoiceTotal).toBe(1000);
    expect(rows.slice(1).every((r) => r.invoiceTotal === 0)).toBe(true);
  });
  it("un déficit déclenche la bascule dans la semaine même, visible dans sweeps", () => {
    const rows = buildForecastTable({
      weekCount: 1,
      anchorDate: new Date("2026-11-09"),
      checkingOpeningBalance: 0,
      locOpeningBalance: 0,
      sweepThreshold: 20000,
      locCreditLimit: LOC_CEILING,
      confirmedInvoices: [],
      recurringOccurrences: [{ date: new Date("2026-11-10"), amount: -1398, label: "Loyer" }],
      manualEntries: [],
    });
    expect(rows[0]!.checkingBalanceBeforeSweep).toBe(-1398);
    expect(rows[0]!.sweeps).toEqual([{ direction: "draw", amount: 20000 }]);
    expect(rows[0]!.checkingBalance).toBe(18602);
    expect(rows[0]!.locOwed).toBe(20000);
  });
  it("recurringDetails/manualDetails exposent chaque ligne incluse dans le total de la semaine (survol demandé)", () => {
    const rows = buildForecastTable({
      weekCount: 1,
      anchorDate: new Date("2026-11-09"),
      checkingOpeningBalance: 10000,
      locOpeningBalance: 0,
      sweepThreshold: 20000,
      locCreditLimit: LOC_CEILING,
      confirmedInvoices: [],
      recurringOccurrences: [
        { date: new Date("2026-11-10"), amount: -1200, label: "Loyer" },
        { date: new Date("2026-11-13"), amount: -300, label: "Assurance" },
      ],
      manualEntries: [{ date: new Date("2026-11-11"), amount: -500, label: "Réparation imprévue" }],
    });
    expect(rows[0]!.recurringTotal).toBe(-1500);
    expect(rows[0]!.recurringDetails).toEqual([
      { label: "Loyer", amount: -1200 },
      { label: "Assurance", amount: -300 },
    ]);
    expect(rows[0]!.manualTotal).toBe(-500);
    expect(rows[0]!.manualDetails).toEqual([{ label: "Réparation imprévue", amount: -500 }]);
  });
});
