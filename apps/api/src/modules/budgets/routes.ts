import { Router } from "express";
import { z } from "zod";
import {
  canCreateBudgetFromRequest,
  canAccessBudget,
  canModifyBudget,
  canModifyBudgetPurchaseLine,
  canApproveBudgetForSending,
  canRecordBudgetOutcome,
} from "@gsc-pilot/business-rules";
import { requireAuth, requirePermission } from "../../auth/middleware.js";
import {
  createBudget,
  listBudgets,
  getBudgetDetail,
  updateRow,
  addBudgetRow,
  removeBudgetRow,
  updateSectionComplexity,
  updateBackupSettings,
  updateProjectBackup,
  updateBudgetMeta,
  markBudgetReady,
  markBudgetSent,
  markBudgetWon,
  markBudgetDeclined,
} from "./service.js";

export const budgetsRouter = Router();

const newClientRequestSchema = z.object({
  company: z.string().min(1),
  contactName: z.string().min(1),
  contactRole: z.string().trim().optional(),
  phone: z.string().min(1),
  email: z.email(),
  address: z.string().trim().optional(),
  requestType: z.enum(["project", "rolling", "service"]),
  urgency: z.enum(["urgent", "normal", "discuss"]),
  salesChannelId: z.uuid(),
  sourceDetail: z.string().trim().optional(),
  summary: z.string().min(1),
});

const createSchema = z
  .object({
    clientRequestId: z.uuid().optional(),
    newClientRequest: newClientRequestSchema.optional(),
  })
  .refine((body) => Boolean(body.clientRequestId) !== Boolean(body.newClientRequest), {
    message: "Choisir une demande existante OU en créer une nouvelle, pas les deux ni aucune.",
  });

budgetsRouter.post(
  "/budgets",
  requireAuth,
  requirePermission((persona) => canCreateBudgetFromRequest(persona)),
  async (req, res) => {
    const body = createSchema.parse(req.body);
    const budget = await createBudget(req.employee!.id, body);
    res.status(201).json({ id: budget.id, displayId: budget.displayId });
  },
);

budgetsRouter.get("/budgets", requireAuth, requirePermission((persona) => canAccessBudget(persona)), async (_req, res) => {
  const budgets = await listBudgets();
  res.json({ budgets });
});

budgetsRouter.get("/budgets/:id", requireAuth, requirePermission((persona) => canAccessBudget(persona)), async (req, res) => {
  const id = z.uuid().parse(req.params.id);
  const budget = await getBudgetDetail(id);
  res.json({ budget });
});

budgetsRouter.patch(
  "/budgets/:id/rows/:rowId",
  requireAuth,
  // Porte large ici (Direction OU Propriétaire) — la porte fine par ligne
  // (Direction seulement pour les lignes "labor"/directionOnly) vit dans le
  // service, qui connaît le type réel de la ligne visée.
  requirePermission((persona) => canModifyBudgetPurchaseLine(persona)),
  async (req, res) => {
    const id = z.uuid().parse(req.params.id);
    const rowId = z.uuid().parse(req.params.rowId);
    const patch = z
      .object({
        label: z.string().optional(),
        hours: z.number().nonnegative().optional(),
        qty: z.number().nonnegative().optional(),
        unitPrice: z.number().nonnegative().optional(),
        risk: z.string().nullable().optional(),
      })
      .parse(req.body);
    await updateRow(req.employee!.persona, id, rowId, patch);
    res.status(204).send();
  },
);

budgetsRouter.post(
  "/budgets/:id/sections/:sectionId/rows",
  requireAuth,
  requirePermission((persona) => canModifyBudgetPurchaseLine(persona)),
  async (req, res) => {
    const id = z.uuid().parse(req.params.id);
    const sectionId = z.uuid().parse(req.params.sectionId);
    const body = z.object({ label: z.string().min(1), unitPrice: z.number().nonnegative().optional() }).parse(req.body);
    const row = await addBudgetRow(req.employee!.persona, id, sectionId, body);
    res.status(201).json(row);
  },
);

budgetsRouter.delete(
  "/budgets/:id/rows/:rowId",
  requireAuth,
  requirePermission((persona) => canModifyBudgetPurchaseLine(persona)),
  async (req, res) => {
    const id = z.uuid().parse(req.params.id);
    const rowId = z.uuid().parse(req.params.rowId);
    await removeBudgetRow(req.employee!.persona, id, rowId);
    res.status(204).send();
  },
);

budgetsRouter.patch(
  "/budgets/:id/sections/:sectionId",
  requireAuth,
  requirePermission((persona) => canModifyBudget(persona)),
  async (req, res) => {
    const id = z.uuid().parse(req.params.id);
    const sectionId = z.uuid().parse(req.params.sectionId);
    const { complexity } = z.object({ complexity: z.number().int().min(0).max(10) }).parse(req.body);
    await updateSectionComplexity(id, sectionId, complexity);
    res.status(204).send();
  },
);

budgetsRouter.patch(
  "/budgets/:id/backup",
  requireAuth,
  requirePermission((persona) => canModifyBudget(persona)),
  async (req, res) => {
    const id = z.uuid().parse(req.params.id);
    const patch = z
      .object({ pct: z.number().nonnegative().optional(), complexity: z.number().int().min(0).max(10).optional() })
      .parse(req.body);
    await updateBackupSettings(id, patch);
    res.status(204).send();
  },
);

budgetsRouter.patch(
  "/budgets/:id/project-backup",
  requireAuth,
  requirePermission((persona) => canModifyBudget(persona)),
  async (req, res) => {
    const id = z.uuid().parse(req.params.id);
    const patch = z
      .object({ amount: z.number().nonnegative().optional(), complexity: z.number().int().min(0).max(10).optional() })
      .parse(req.body);
    await updateProjectBackup(id, patch);
    res.status(204).send();
  },
);

budgetsRouter.patch(
  "/budgets/:id/meta",
  requireAuth,
  requirePermission((persona) => canModifyBudget(persona)),
  async (req, res) => {
    const id = z.uuid().parse(req.params.id);
    const patch = z
      .object({
        poNumber: z.string().nullable().optional(),
        quantity: z.number().int().positive().optional(),
        validUntil: z.iso.date().nullable().optional(),
        summary: z.string().nullable().optional(),
        riskSummary: z.string().nullable().optional(),
      })
      .parse(req.body);
    await updateBudgetMeta(id, patch);
    res.status(204).send();
  },
);

budgetsRouter.post(
  "/budgets/:id/mark-ready",
  requireAuth,
  requirePermission((persona) => canApproveBudgetForSending(persona)),
  async (req, res) => {
    const id = z.uuid().parse(req.params.id);
    const budget = await markBudgetReady(id);
    res.json({ id: budget.id, status: budget.status });
  },
);

budgetsRouter.post(
  "/budgets/:id/mark-sent",
  requireAuth,
  requirePermission((persona) => canRecordBudgetOutcome(persona)),
  async (req, res) => {
    const id = z.uuid().parse(req.params.id);
    const budget = await markBudgetSent(id);
    res.json({ id: budget.id, status: budget.status });
  },
);

budgetsRouter.post(
  "/budgets/:id/mark-won",
  requireAuth,
  requirePermission((persona) => canRecordBudgetOutcome(persona)),
  async (req, res) => {
    const id = z.uuid().parse(req.params.id);
    const budget = await markBudgetWon(id);
    res.json({ id: budget.id, status: budget.status });
  },
);

budgetsRouter.post(
  "/budgets/:id/mark-declined",
  requireAuth,
  requirePermission((persona) => canRecordBudgetOutcome(persona)),
  async (req, res) => {
    const id = z.uuid().parse(req.params.id);
    const budget = await markBudgetDeclined(id);
    res.json({ id: budget.id, status: budget.status });
  },
);
