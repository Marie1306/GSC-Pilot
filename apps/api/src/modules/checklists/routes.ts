import { Router } from "express";
import { z } from "zod";
import { canManageProductionChecklist, canAccessProductionChecklist, canAccessProject } from "@gsc-pilot/business-rules";
import { requireAuth, requirePermission } from "../../auth/middleware.js";
import {
  createChecklist,
  addChecklistItem,
  updateChecklistItem,
  listProjectsWithActiveChecklists,
  listProjectChecklists,
  setChecklistItemStepCompleted,
} from "./service.js";

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
  force: z.boolean().optional(),
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

const updateItemSchema = z.object({
  number: z.string().min(1).optional(),
  quantity: z.number().int().positive().nullable().optional(),
  thickness: z.string().nullable().optional(),
  material: z.string().nullable().optional(),
  shapeType: z.enum(["tube", "shaft", "print3d"]).nullable().optional(),
  tubeShape: z.enum(["round", "square", "rectangle"]).nullable().optional(),
  tubeOD: z.string().nullable().optional(),
  tubeID: z.string().nullable().optional(),
  tubeMeasurement1: z.string().nullable().optional(),
  tubeMeasurement2: z.string().nullable().optional(),
  tubeWallThickness: z.string().nullable().optional(),
  shaftMeasurement: z.string().nullable().optional(),
  note: z.string().nullable().optional(),
  activeStepIds: z.array(z.uuid()).optional(),
  force: z.boolean().optional(),
});
checklistsRouter.patch(
  "/checklist-items/:itemId",
  requireAuth,
  requirePermission((persona) => canManageProductionChecklist(persona)),
  async (req, res) => {
    const itemId = z.uuid().parse(req.params.itemId);
    const body = updateItemSchema.parse(req.body);
    const item = await updateChecklistItem(itemId, body);
    res.json({ item });
  },
);

checklistsRouter.get(
  "/checklists/active-projects",
  requireAuth,
  requirePermission((persona) => canAccessProductionChecklist(persona)),
  async (_req, res) => {
    const projects = await listProjectsWithActiveChecklists();
    res.json({ projects });
  },
);

// Vue de travail (ChecklistProjectView, menu "Checklist de production") —
// même porte que le reste du module (canAccessProductionChecklist, "tout le
// monde sauf Magasinier"). Écart trouvé et corrigé le 26 août 2026 : cette
// vue appelait par erreur la route archive ci-dessous (canAccessProject),
// qui exclut aussi l'Employé — resté bloqué (403) en boucle de retentatives
// React Query, perçu comme "reste en mode chargement" côté interface.
checklistsRouter.get(
  "/checklists/projects/:projectId",
  requireAuth,
  requirePermission((persona) => canAccessProductionChecklist(persona)),
  async (req, res) => {
    const projectId = z.uuid().parse(req.params.projectId);
    const checklists = await listProjectChecklists(projectId);
    res.json({ checklists });
  },
);

// Archive complète d'un projet — même porte que le reste du détail projet
// (canAccessProject), pas canAccessProductionChecklist : reachée uniquement
// depuis le menu Options du projet, jamais depuis le menu "Checklist de
// production" ci-dessus — jamais exposée à l'Employé.
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
