import { Router } from "express";
import { canAccessOverviewViews } from "@gsc-pilot/business-rules";
import { requireAuth, requirePermission } from "../../auth/middleware.js";
import { getActionCenterItems } from "./service.js";

// Monté sur /api directement (voir app.ts) — même patron que reports/rollings.
export const actionCenterRouter = Router();

actionCenterRouter.get(
  "/action-center/items",
  requireAuth,
  requirePermission((persona) => canAccessOverviewViews(persona)),
  async (req, res) => {
    const employee = req.employee!;
    const items = await getActionCenterItems(employee.persona, employee.id);
    res.json({ items });
  },
);
