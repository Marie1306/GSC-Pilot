import { Router } from "express";
import { z } from "zod";
import { canManageTreasury } from "@gsc-pilot/business-rules";
import { requireAuth, requirePermission } from "../../auth/middleware.js";
import {
  getTreasurySettings,
  upsertTreasurySettings,
  listRecurringExpenses,
  createRecurringExpense,
  updateRecurringExpense,
  deleteRecurringExpense,
  setRecurringExpenseOverride,
  clearRecurringExpenseOverride,
  listManualEntries,
  createManualEntry,
  deleteManualEntry,
  getForecastTable,
  listPendingInvoiceEntriesForForecast,
} from "./service.js";

export const treasuryRouter = Router();

// Chaque route applique requireAuth/requirePermission elle-même (même
// patron que projects/serviceCalls/externalSales routes.ts) — jamais un
// .use() partagé sur ce routeur.
const requireTreasury = requirePermission((persona) => canManageTreasury(persona));

treasuryRouter.get("/treasury/settings", requireAuth, requireTreasury, async (_req, res) => {
  res.json({ settings: await getTreasurySettings() });
});

const settingsSchema = z.object({
  checkingOpeningBalance: z.number(),
  checkingOpeningDate: z.iso.date(),
  locOpeningBalance: z.number().nonnegative(),
  locOpeningDate: z.iso.date(),
  sweepThreshold: z.number().positive(),
});
treasuryRouter.put("/treasury/settings", requireAuth, requireTreasury, async (req, res) => {
  const body = settingsSchema.parse(req.body);
  res.json({ settings: await upsertTreasurySettings(body) });
});

treasuryRouter.get("/treasury/recurring-expenses", requireAuth, requireTreasury, async (_req, res) => {
  res.json({ expenses: await listRecurringExpenses() });
});

const createExpenseSchema = z.object({ label: z.string().min(1), dayOfMonth: z.number().int(), defaultAmount: z.number() });
treasuryRouter.post("/treasury/recurring-expenses", requireAuth, requireTreasury, async (req, res) => {
  const body = createExpenseSchema.parse(req.body);
  res.status(201).json({ expense: await createRecurringExpense(body) });
});

const updateExpenseSchema = z.object({
  label: z.string().min(1).optional(),
  dayOfMonth: z.number().int().optional(),
  defaultAmount: z.number().optional(),
  active: z.boolean().optional(),
});
treasuryRouter.patch("/treasury/recurring-expenses/:id", requireAuth, requireTreasury, async (req, res) => {
  const id = z.uuid().parse(req.params.id);
  const body = updateExpenseSchema.parse(req.body);
  res.json({ expense: await updateRecurringExpense(id, body) });
});

treasuryRouter.delete("/treasury/recurring-expenses/:id", requireAuth, requireTreasury, async (req, res) => {
  const id = z.uuid().parse(req.params.id);
  await deleteRecurringExpense(id);
  res.status(204).end();
});

const yearMonthSchema = z.string().regex(/^\d{4}-\d{2}$/);
const overrideSchema = z.object({ amount: z.number() });
treasuryRouter.put("/treasury/recurring-expenses/:id/overrides/:yearMonth", requireAuth, requireTreasury, async (req, res) => {
  const id = z.uuid().parse(req.params.id);
  const yearMonth = yearMonthSchema.parse(req.params.yearMonth);
  const { amount } = overrideSchema.parse(req.body);
  res.json({ expense: await setRecurringExpenseOverride(id, yearMonth, amount) });
});

treasuryRouter.delete("/treasury/recurring-expenses/:id/overrides/:yearMonth", requireAuth, requireTreasury, async (req, res) => {
  const id = z.uuid().parse(req.params.id);
  const yearMonth = yearMonthSchema.parse(req.params.yearMonth);
  res.json({ expense: await clearRecurringExpenseOverride(id, yearMonth) });
});

treasuryRouter.get("/treasury/manual-entries", requireAuth, requireTreasury, async (_req, res) => {
  res.json({ entries: await listManualEntries() });
});

const createManualEntrySchema = z.object({ label: z.string().min(1), amount: z.number(), date: z.iso.date() });
treasuryRouter.post("/treasury/manual-entries", requireAuth, requireTreasury, async (req, res) => {
  const body = createManualEntrySchema.parse(req.body);
  res.status(201).json({ entry: await createManualEntry(body, req.employee!.id) });
});

treasuryRouter.delete("/treasury/manual-entries/:id", requireAuth, requireTreasury, async (req, res) => {
  const id = z.uuid().parse(req.params.id);
  await deleteManualEntry(id);
  res.status(204).end();
});

treasuryRouter.get("/treasury/forecast", requireAuth, requireTreasury, async (req, res) => {
  const weeks = req.query.weeks ? Number(req.query.weeks) : undefined;
  res.json({ weeks: await getForecastTable(weeks) });
});

treasuryRouter.get("/treasury/pending-entries", requireAuth, requireTreasury, async (_req, res) => {
  res.json({ entries: await listPendingInvoiceEntriesForForecast() });
});
