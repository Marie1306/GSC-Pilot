import { Router } from "express";
import { z } from "zod";
import { canManageSoumission } from "@gsc-pilot/business-rules";
import { requireAuth, requirePermission } from "../../auth/middleware.js";
import { convertSoumissionToConfirmation, getConfirmationDetail, getConfirmationForSoumission, deleteConfirmationDeCommande } from "./service.js";

export const confirmationsDeCommandeRouter = Router();

// Même porte que tout le cycle Soumission (voir soumissions/routes.ts) —
// Confirmation de commande en découle directement, jamais une permission
// distincte.
const canManage = (persona: Parameters<typeof canManageSoumission>[0]) => canManageSoumission(persona);

const convertSchema = z.object({ clientPoNumber: z.string().trim().optional() });
confirmationsDeCommandeRouter.post("/soumissions/:soumissionId/confirmation", requireAuth, requirePermission(canManage), async (req, res) => {
  const soumissionId = z.uuid().parse(req.params.soumissionId);
  const body = convertSchema.parse(req.body);
  const confirmation = await convertSoumissionToConfirmation(soumissionId, req.employee!.id, body);
  res.status(201).json({ confirmation });
});

confirmationsDeCommandeRouter.get("/soumissions/:soumissionId/confirmation", requireAuth, requirePermission(canManage), async (req, res) => {
  const soumissionId = z.uuid().parse(req.params.soumissionId);
  const confirmation = await getConfirmationForSoumission(soumissionId);
  res.json({ confirmation });
});

confirmationsDeCommandeRouter.get("/confirmations/:id", requireAuth, requirePermission(canManage), async (req, res) => {
  const id = z.uuid().parse(req.params.id);
  const confirmation = await getConfirmationDetail(id);
  res.json({ confirmation });
});

confirmationsDeCommandeRouter.delete("/confirmations/:id", requireAuth, requirePermission(canManage), async (req, res) => {
  const id = z.uuid().parse(req.params.id);
  await deleteConfirmationDeCommande(id);
  res.status(204).end();
});
