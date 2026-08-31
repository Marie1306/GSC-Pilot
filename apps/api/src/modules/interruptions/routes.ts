import { Router } from "express";
import { z } from "zod";
import { canAccessOverviewViews, canEditGanttSchedule, INTERRUPTION_REASONS } from "@gsc-pilot/business-rules";
import { requireAuth, requirePermission } from "../../auth/middleware.js";
import { listInterruptions, createInterruption, updateInterruption, deleteInterruption } from "./service.js";

// Monté sur /api directement (voir app.ts) — même patron que rollings/reports.
export const interruptionsRouter = Router();

interruptionsRouter.get(
  "/interruptions",
  requireAuth,
  requirePermission((persona) => canAccessOverviewViews(persona)),
  async (_req, res) => {
    const interruptions = await listInterruptions();
    res.json({ interruptions });
  },
);

const interruptionSchema = z.object({
  employeeId: z.uuid().nullable().optional(),
  date: z.iso.date(),
  hours: z.number().positive(),
  reason: z.enum(INTERRUPTION_REASONS),
  reference: z.string().optional(),
});

interruptionsRouter.post(
  "/interruptions",
  requireAuth,
  requirePermission((persona) => canEditGanttSchedule(persona)),
  async (req, res) => {
    const body = interruptionSchema.parse(req.body);
    const interruption = await createInterruption(body, req.employee!.id);
    res.status(201).json({ interruption });
  },
);

interruptionsRouter.patch(
  "/interruptions/:id",
  requireAuth,
  requirePermission((persona) => canEditGanttSchedule(persona)),
  async (req, res) => {
    const id = z.uuid().parse(req.params.id);
    const body = interruptionSchema.parse(req.body);
    const interruption = await updateInterruption(id, body);
    res.json({ interruption });
  },
);

interruptionsRouter.delete(
  "/interruptions/:id",
  requireAuth,
  requirePermission((persona) => canEditGanttSchedule(persona)),
  async (req, res) => {
    const id = z.uuid().parse(req.params.id);
    await deleteInterruption(id);
    res.status(204).end();
  },
);
