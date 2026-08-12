import { Router } from "express";
import { z } from "zod";
import { canAccessProject } from "@gsc-pilot/business-rules";
import { requireAuth, requirePermission } from "../../auth/middleware.js";
import { prisma } from "../../db.js";
import { listProjects, getProjectDetail } from "./service.js";

export const projectsRouter = Router();

/**
 * Liste minimale (id/numéro/nom) — pour l'instant seulement pour peupler
 * le sélecteur de projet de la liste rapide d'achats. L'écran Projets
 * complet (avec le résumé financier) vient dans une prochaine phase.
 */
projectsRouter.get("/projects", requireAuth, async (_req, res) => {
  const projects = await prisma.project.findMany({
    where: { closedAt: null },
    select: { id: true, projectNumber: true, name: true },
    orderBy: { projectNumber: "asc" },
  });
  res.json({ projects });
});

/** Liste complète (financière) — Phase 1 du module Projet, 12 août 2026. */
projectsRouter.get("/projects/full", requireAuth, requirePermission((persona) => canAccessProject(persona)), async (_req, res) => {
  const projects = await listProjects();
  res.json({ projects });
});

projectsRouter.get("/projects/:id", requireAuth, requirePermission((persona) => canAccessProject(persona)), async (req, res) => {
  const id = z.uuid().parse(req.params.id);
  const project = await getProjectDetail(id);
  res.json({ project });
});
