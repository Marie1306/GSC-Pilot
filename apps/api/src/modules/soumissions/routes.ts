import { Router } from "express";
import { z } from "zod";
import { canManageSoumission } from "@gsc-pilot/business-rules";
import { requireAuth, requirePermission } from "../../auth/middleware.js";
import { createSoumission, updateSoumission, sendSoumission, decideSoumission, deleteSoumission, listSoumissionsForBudget, getSoumissionDetail } from "./service.js";

export const soumissionsRouter = Router();

const canManage = (persona: Parameters<typeof canManageSoumission>[0]) => canManageSoumission(persona);

const lineSchema = z.object({
  label: z.string().min(1, "Le libellé est requis."),
  amount: z.number().positive(),
});

soumissionsRouter.get("/budgets/:budgetId/soumissions", requireAuth, requirePermission(canManage), async (req, res) => {
  const budgetId = z.uuid().parse(req.params.budgetId);
  const soumissions = await listSoumissionsForBudget(budgetId);
  res.json({ soumissions });
});

const createSoumissionSchema = z.object({
  introText: z.string().trim().optional(),
  termsText: z.string().trim().optional(),
  lines: z.array(lineSchema).min(1, "Au moins une ligne est requise."),
});
soumissionsRouter.post("/budgets/:budgetId/soumissions", requireAuth, requirePermission(canManage), async (req, res) => {
  const budgetId = z.uuid().parse(req.params.budgetId);
  const body = createSoumissionSchema.parse(req.body);
  const soumission = await createSoumission(budgetId, req.employee!.id, body);
  res.status(201).json({ soumission });
});

soumissionsRouter.get("/soumissions/:id", requireAuth, requirePermission(canManage), async (req, res) => {
  const id = z.uuid().parse(req.params.id);
  const soumission = await getSoumissionDetail(id);
  res.json({ soumission });
});

const updateSoumissionSchema = z.object({
  introText: z.string().trim().optional(),
  termsText: z.string().trim().optional(),
  lines: z.array(lineSchema).min(1).optional(),
});
soumissionsRouter.patch("/soumissions/:id", requireAuth, requirePermission(canManage), async (req, res) => {
  const id = z.uuid().parse(req.params.id);
  const body = updateSoumissionSchema.parse(req.body);
  const soumission = await updateSoumission(id, body);
  res.json({ soumission });
});

soumissionsRouter.post("/soumissions/:id/send", requireAuth, requirePermission(canManage), async (req, res) => {
  const id = z.uuid().parse(req.params.id);
  const soumission = await sendSoumission(id);
  res.json({ soumission });
});

const decideSoumissionSchema = z.object({ outcome: z.enum(["accepted", "declined"]) });
soumissionsRouter.post("/soumissions/:id/decide", requireAuth, requirePermission(canManage), async (req, res) => {
  const id = z.uuid().parse(req.params.id);
  const { outcome } = decideSoumissionSchema.parse(req.body);
  const soumission = await decideSoumission(id, outcome);
  res.json({ soumission });
});

soumissionsRouter.delete("/soumissions/:id", requireAuth, requirePermission(canManage), async (req, res) => {
  const id = z.uuid().parse(req.params.id);
  await deleteSoumission(id);
  res.status(204).end();
});
