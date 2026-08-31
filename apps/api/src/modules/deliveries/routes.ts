import { Router } from "express";
import { z } from "zod";
import { canAccessDeliveries } from "@gsc-pilot/business-rules";
import { requireAuth, requirePermission } from "../../auth/middleware.js";
import { listDeliveries, getDeliveryDetail, updateDelivery, confirmDelivery } from "./service.js";

// Monté sur /api directement (voir app.ts) — chaque route applique donc
// requireAuth/requirePermission elle-même, jamais un .use() global sans
// chemin (voir settings/routes.ts pour le piège déjà documenté).
export const deliveriesRouter = Router();

deliveriesRouter.get("/deliveries", requireAuth, requirePermission((persona) => canAccessDeliveries(persona)), async (req, res) => {
  const employee = req.employee!;
  const deliveries = await listDeliveries(employee.persona, employee.id);
  res.json({ deliveries });
});

deliveriesRouter.get("/deliveries/:id", requireAuth, requirePermission((persona) => canAccessDeliveries(persona)), async (req, res) => {
  const id = z.uuid().parse(req.params.id);
  const delivery = await getDeliveryDetail(id);
  res.json({ delivery });
});

const updateSchema = z.object({
  items: z.string().nullable().optional(),
  kmTraveled: z.number().nonnegative().nullable().optional(),
  conditionNote: z.string().nullable().optional(),
});
deliveriesRouter.patch("/deliveries/:id", requireAuth, requirePermission((persona) => canAccessDeliveries(persona)), async (req, res) => {
  const id = z.uuid().parse(req.params.id);
  const body = updateSchema.parse(req.body);
  await updateDelivery(id, body);
  res.status(204).end();
});

const confirmSchema = z.object({ dataUrl: z.string().min(1), signerName: z.string().min(1) });
deliveriesRouter.post(
  "/deliveries/:id/confirm",
  requireAuth,
  requirePermission((persona) => canAccessDeliveries(persona)),
  async (req, res) => {
    const id = z.uuid().parse(req.params.id);
    const { dataUrl, signerName } = confirmSchema.parse(req.body);
    await confirmDelivery(id, dataUrl, signerName);
    res.status(204).end();
  },
);
