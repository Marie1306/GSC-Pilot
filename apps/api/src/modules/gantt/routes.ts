import { Router } from "express";
import { z } from "zod";
import { canAccessOverviewViews, canEditGanttSchedule } from "@gsc-pilot/business-rules";
import { requireAuth, requirePermission } from "../../auth/middleware.js";
import {
  computeProductionSchedule,
  listGanttReadyQueue,
  previewGanttEntry,
  assignProductionTask,
  setProductionTaskCompleted,
} from "./service.js";

export const ganttRouter = Router();

ganttRouter.get(
  "/gantt/schedule",
  requireAuth,
  requirePermission((persona) => canAccessOverviewViews(persona)),
  async (_req, res) => {
    const schedule = await computeProductionSchedule();
    res.json({ schedule });
  },
);

ganttRouter.get(
  "/gantt/ready-queue",
  requireAuth,
  requirePermission((persona) => canAccessOverviewViews(persona)),
  async (_req, res) => {
    const queue = await listGanttReadyQueue();
    res.json({ queue });
  },
);

// Réservé à Direction (canEditGanttSchedule) — Administration/Propriétaire
// n'ont qu'un accès visuel au Gantt (roles.ts, doc de canEditGanttSchedule),
// jamais le geste d'entrée que cet aperçu prépare.
const previewSchema = z.object({
  ownerType: z.enum(["project", "rolling"]),
  ownerId: z.uuid(),
  batchId: z.string().optional(),
  hoursByCategory: z.record(z.string(), z.number().nonnegative()).optional(),
  priority: z.number().int().optional(),
});
ganttRouter.post(
  "/gantt/preview",
  requireAuth,
  requirePermission((persona) => canEditGanttSchedule(persona)),
  async (req, res) => {
    const body = previewSchema.parse(req.body);
    const preview = await previewGanttEntry(body);
    res.json({ preview });
  },
);

const assignSchema = z.object({ employeeId: z.uuid().nullable() });
ganttRouter.patch(
  "/gantt/tasks/:id/assignment",
  requireAuth,
  requirePermission((persona) => canEditGanttSchedule(persona)),
  async (req, res) => {
    const id = z.uuid().parse(req.params.id);
    const { employeeId } = assignSchema.parse(req.body);
    await assignProductionTask(id, employeeId);
    res.status(204).end();
  },
);

const completedSchema = z.object({ completed: z.boolean() });
ganttRouter.patch(
  "/gantt/tasks/:id/completed",
  requireAuth,
  requirePermission((persona) => canEditGanttSchedule(persona)),
  async (req, res) => {
    const id = z.uuid().parse(req.params.id);
    const { completed } = completedSchema.parse(req.body);
    await setProductionTaskCompleted(id, completed);
    res.status(204).end();
  },
);
