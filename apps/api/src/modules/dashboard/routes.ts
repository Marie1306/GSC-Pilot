import { Router } from "express";
import { requireAuth } from "../../auth/middleware.js";
import { getDashboardSummary } from "./service.js";

// Monté sur /api directement (voir app.ts) — pas de canAccessX en porte
// ici : accessible à tous les rôles authentifiés (voir en-tête de
// service.ts pour pourquoi), chaque compteur se filtre déjà lui-même selon
// le rôle du visiteur.
export const dashboardRouter = Router();

dashboardRouter.get("/dashboard/summary", requireAuth, async (req, res) => {
  const employee = req.employee!;
  const summary = await getDashboardSummary(employee.persona, employee.id);
  res.json({ summary });
});
