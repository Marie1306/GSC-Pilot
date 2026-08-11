import { Router } from "express";
import { requireAuth } from "../../auth/middleware.js";
import { prisma } from "../../db.js";

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
