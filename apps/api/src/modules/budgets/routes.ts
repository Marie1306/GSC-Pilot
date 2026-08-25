import { Router } from "express";
import { z } from "zod";
import {
  canCreateBudgetFromRequest,
  canAccessBudget,
  canModifyBudget,
  canModifyBudgetPurchaseLine,
  canApproveBudgetForSending,
  canRecordBudgetOutcome,
  canConvertBudgetToProject,
  canConvertBudgetToRolling,
  canDeleteBudget,
  canResetBudget,
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
  deleteBudget,
  resetBudgetContent,
  getNextBudgetDisplayId,
  addBudgetNote,
} from "./service.js";
import { convertBudgetToProject } from "../projects/service.js";
import { convertBudgetToRolling } from "../rollings/service.js";

export const budgetsRouter = Router();

/** Aperçu pour la modale « Ajouter rapidement » (23 août 2026) — mêmes rôles que la création directe. */
budgetsRouter.get(
  "/budgets/next-number",
  requireAuth,
  requirePermission((persona) => canCreateBudgetFromRequest(persona)),
  async (_req, res) => {
    const nextDisplayId = await getNextBudgetDisplayId();
    res.json({ nextDisplayId });
  },
);

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

budgetsRouter.delete("/budgets/:id", requireAuth, requirePermission((persona) => canDeleteBudget(persona)), async (req, res) => {
  const id = z.uuid().parse(req.params.id);
  await deleteBudget(id);
  res.status(204).end();
});

budgetsRouter.post("/budgets/:id/reset", requireAuth, requirePermission((persona) => canResetBudget(persona)), async (req, res) => {
  const id = z.uuid().parse(req.params.id);
  await resetBudgetContent(id);
  res.status(204).end();
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

/** Notes datées pour le suivi client (25 août 2026) — même porte que la modification du contenu, jamais bloquée par readOnly (informatif, pas du contenu financier). */
budgetsRouter.post(
  "/budgets/:id/notes",
  requireAuth,
  requirePermission((persona) => canModifyBudget(persona)),
  async (req, res) => {
    const id = z.uuid().parse(req.params.id);
    const { body } = z.object({ body: z.string().min(1, "La note ne peut pas être vide.") }).parse(req.body);
    const note = await addBudgetNote(id, req.employee!.id, body);
    res.status(201).json({ note });
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

/** Conversion en projet : Direction seulement, uniquement depuis un budgétaire « Contrat obtenu » (confirmé le 12 août 2026). */
budgetsRouter.post(
  "/budgets/:id/convert-to-project",
  requireAuth,
  requirePermission((persona) => canConvertBudgetToProject(persona)),
  async (req, res) => {
    const id = z.uuid().parse(req.params.id);
    const body = z.object({ name: z.string().min(1), projectNumber: z.string().optional() }).parse(req.body);
    const project = await convertBudgetToProject(req.employee!.id, id, body);
    res.status(201).json({ id: project.id, projectNumber: project.projectNumber });
  },
);

/** Conversion en roulement : Direction seulement, uniquement depuis un budgétaire « Contrat obtenu » (même palier que convert-to-project). */
budgetsRouter.post(
  "/budgets/:id/convert-to-rolling",
  requireAuth,
  requirePermission((persona) => canConvertBudgetToRolling(persona)),
  async (req, res) => {
    const id = z.uuid().parse(req.params.id);
    const rolling = await convertBudgetToRolling(req.employee!.id, id);
    res.status(201).json({ id: rolling.id });
  },
);
