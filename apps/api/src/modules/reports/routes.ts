import { Router } from "express";
import { z } from "zod";
import { canAccessOverviewViews } from "@gsc-pilot/business-rules";
import { requireAuth, requirePermission } from "../../auth/middleware.js";
import { getProfitabilityReport, getChannelConversion, getInternalStats } from "./service.js";

// Monté sur /api directement (voir app.ts) — chaque route applique donc
// requireAuth/requirePermission elle-même, jamais un .use() global sans
// chemin (voir settings/routes.ts pour le piège déjà documenté).
export const reportsRouter = Router();

const overviewQuerySchema = z.object({ year: z.coerce.number().int().optional() });

reportsRouter.get("/reports/overview", requireAuth, requirePermission((persona) => canAccessOverviewViews(persona)), async (req, res) => {
  const { year } = overviewQuerySchema.parse(req.query);
  const employee = req.employee!;
  const [profitability, channelConversion, internalStats] = await Promise.all([
    getProfitabilityReport(employee.persona, employee.id),
    getChannelConversion(),
    getInternalStats(year ?? new Date().getFullYear()),
  ]);
  res.json({ profitability, channelConversion, internalStats });
});
