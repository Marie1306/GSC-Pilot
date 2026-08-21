import { Router } from "express";
import { z } from "zod";
import { canDeclareSubassembly, canPrepareSubassemblyPartsList, canDeclareAssemblyReady, canAccessProject } from "@gsc-pilot/business-rules";
import { requireAuth, requirePermission } from "../../auth/middleware.js";
import {
  listSubassembliesForProject,
  listMySubassemblies,
  declareSubassemblyForProject,
  markSubassemblyPartsListReady,
  declareSubassemblyAssemblyReady,
} from "./service.js";

export const subassembliesRouter = Router();

// subassembly.id n'est jamais un uuid (identifiant composé "<projectId>-<numéro>", voir service.ts) — z.string() seulement.
const subassemblyIdSchema = z.string().min(1);

subassembliesRouter.get(
  "/projects/:projectId/subassemblies",
  requireAuth,
  requirePermission((persona) => canAccessProject(persona)),
  async (req, res) => {
    const projectId = z.uuid().parse(req.params.projectId);
    const subassemblies = await listSubassembliesForProject(projectId);
    res.json({ subassemblies });
  },
);

// Le mini Gantt du designer — ouvert à tout employé authentifié (voir son propre historique, rien d'autre).
subassembliesRouter.get("/subassemblies/mine", requireAuth, async (req, res) => {
  const subassemblies = await listMySubassemblies(req.employee!.id);
  res.json({ subassemblies });
});

const declareSchema = z.object({ number: z.string().min(1) });
// Déclarer un sous-assemblage prêt : Propriétaire seulement (Marc, le seul
// designer — corrigé le 21 août 2026, voir roles.ts canDeclareSubassembly).
subassembliesRouter.post(
  "/projects/:projectId/subassemblies",
  requireAuth,
  requirePermission((persona) => canDeclareSubassembly(persona)),
  async (req, res) => {
    const projectId = z.uuid().parse(req.params.projectId);
    const { number } = declareSchema.parse(req.body);
    const subassembly = await declareSubassemblyForProject(projectId, number, req.employee!.id);
    res.status(201).json({ subassembly });
  },
);

const partsListSchema = z.object({ hoursByCategory: z.record(z.string(), z.number().nonnegative()) });
subassembliesRouter.post(
  "/subassemblies/:id/parts-list",
  requireAuth,
  requirePermission((persona) => canPrepareSubassemblyPartsList(persona)),
  async (req, res) => {
    const id = subassemblyIdSchema.parse(req.params.id);
    const { hoursByCategory } = partsListSchema.parse(req.body);
    const subassembly = await markSubassemblyPartsListReady(id, req.employee!.id, hoursByCategory);
    res.json({ subassembly });
  },
);

subassembliesRouter.post(
  "/subassemblies/:id/assembly-ready",
  requireAuth,
  requirePermission((persona) => canDeclareAssemblyReady(persona)),
  async (req, res) => {
    const id = subassemblyIdSchema.parse(req.params.id);
    const subassembly = await declareSubassemblyAssemblyReady(id, req.employee!.id);
    res.json({ subassembly });
  },
);
