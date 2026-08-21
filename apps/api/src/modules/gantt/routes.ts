import { Router } from "express";
import { z } from "zod";
import { canAccessOverviewViews, canAccessProject, canEditGanttSchedule } from "@gsc-pilot/business-rules";
import { requireAuth, requirePermission } from "../../auth/middleware.js";
import { listProductionTasks, listProjectProductionTasks, assignProductionTask, setProductionTaskCompleted } from "./service.js";

export const ganttRouter = Router();

ganttRouter.get(
  "/gantt/tasks",
  requireAuth,
  requirePermission((persona) => canAccessOverviewViews(persona)),
  async (_req, res) => {
    const tasks = await listProductionTasks();
    res.json({ tasks });
  },
);

ganttRouter.get(
  "/projects/:projectId/gantt-tasks",
  requireAuth,
  requirePermission((persona) => canAccessProject(persona)),
  async (req, res) => {
    const projectId = z.uuid().parse(req.params.projectId);
    const tasks = await listProjectProductionTasks(projectId);
    res.json({ tasks });
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
