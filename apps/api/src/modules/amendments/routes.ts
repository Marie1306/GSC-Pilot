import { Router } from "express";
import { z } from "zod";
import { canAccessProject, canCreateAmendment } from "@gsc-pilot/business-rules";
import { requireAuth, requirePermission } from "../../auth/middleware.js";
import { listAmendmentsForProject, createAmendment } from "./service.js";

export const amendmentsRouter = Router();

amendmentsRouter.get(
  "/projects/:projectId/amendments",
  requireAuth,
  requirePermission((persona) => canAccessProject(persona)),
  async (req, res) => {
    const projectId = z.uuid().parse(req.params.projectId);
    const amendments = await listAmendmentsForProject(projectId, req.employee!.persona);
    res.json({ amendments });
  },
);

const createSchema = z.object({
  hoursByCategory: z.record(z.string(), z.number().nonnegative()),
  marginPct: z.number().min(0).max(99.99),
  backupPct: z.number().min(0),
  purchases: z.number().nonnegative().optional(),
});
amendmentsRouter.post(
  "/projects/:projectId/amendments",
  requireAuth,
  requirePermission((persona) => canCreateAmendment(persona)),
  async (req, res) => {
    const projectId = z.uuid().parse(req.params.projectId);
    const input = createSchema.parse(req.body);
    const amendment = await createAmendment(projectId, req.employee!.id, input, req.employee!.persona);
    res.status(201).json({ amendment });
  },
);
