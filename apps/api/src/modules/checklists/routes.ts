import { Router } from "express";
import { z } from "zod";
import { canManageProductionChecklist, canAccessProductionChecklist, canAccessProject } from "@gsc-pilot/business-rules";
import { requireAuth, requirePermission } from "../../auth/middleware.js";
import { createChecklist, addChecklistItem, listActiveChecklistItems, listProjectChecklists, setChecklistItemStepCompleted } from "./service.js";

export const checklistsRouter = Router();

const createChecklistSchema = z.object({ projectId: z.uuid(), assemblyLabel: z.string().optional() });
checklistsRouter.post(
  "/checklists",
  requireAuth,
  requirePermission((persona) => canManageProductionChecklist(persona)),
  async (req, res) => {
    const { projectId, assemblyLabel } = createChecklistSchema.parse(req.body);
    const checklist = await createChecklist(projectId, req.employee!.id, assemblyLabel);
    res.status(201).json({ checklist });
  },
);

const addItemSchema = z.object({
  kind: z.enum(["piece", "subassembly"]),
  parentItemId: z.uuid().optional(),
  number: z.string().min(1),
  quantity: z.number().int().positive().optional(),
  thickness: z.string().optional(),
  material: z.string().optional(),
  shapeType: z.enum(["tube", "shaft", "print3d"]).optional(),
  tubeShape: z.enum(["round", "square", "rectangle"]).optional(),
  tubeOD: z.string().optional(),
  tubeID: z.string().optional(),
  tubeMeasurement1: z.string().optional(),
  tubeMeasurement2: z.string().optional(),
  tubeWallThickness: z.string().optional(),
  shaftMeasurement: z.string().optional(),
  note: z.string().optional(),
  activeStepIds: z.array(z.uuid()).default([]),
});
checklistsRouter.post(
  "/checklists/:id/items",
  requireAuth,
  requirePermission((persona) => canManageProductionChecklist(persona)),
  async (req, res) => {
    const checklistId = z.uuid().parse(req.params.id);
    const body = addItemSchema.parse(req.body);
    const item = await addChecklistItem(checklistId, req.employee!.id, body);
    res.status(201).json({ item });
  },
);

const activeItemsQuerySchema = z.object({ stepId: z.uuid().optional(), thickness: z.string().optional() });
checklistsRouter.get(
  "/checklists/active-items",
  requireAuth,
  requirePermission((persona) => canAccessProductionChecklist(persona)),
  async (req, res) => {
    const filters = activeItemsQuerySchema.parse(req.query);
    const items = await listActiveChecklistItems(filters);
    res.json({ items });
  },
);

// Archive complète d'un projet — même porte que le reste du détail projet
// (canAccessProject), pas canAccessProductionChecklist : reachée depuis le
// menu Options du projet, jamais exposée séparément à l'Employé.
checklistsRouter.get(
  "/projects/:projectId/checklists",
  requireAuth,
  requirePermission((persona) => canAccessProject(persona)),
  async (req, res) => {
    const projectId = z.uuid().parse(req.params.projectId);
    const checklists = await listProjectChecklists(projectId);
    res.json({ checklists });
  },
);

const toggleStepSchema = z.object({ completed: z.boolean() });
checklistsRouter.patch(
  "/checklist-items/:itemId/steps/:stepId",
  requireAuth,
  requirePermission((persona) => canAccessProductionChecklist(persona)),
  async (req, res) => {
    const itemId = z.uuid().parse(req.params.itemId);
    const stepId = z.uuid().parse(req.params.stepId);
    const { completed } = toggleStepSchema.parse(req.body);
    await setChecklistItemStepCompleted(itemId, stepId, completed, req.employee!.id);
    res.status(204).end();
  },
);
