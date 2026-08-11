import { Router } from "express";
import { z } from "zod";
import { canAccessSettings } from "@gsc-pilot/business-rules";
import { requireAuth, requirePermission } from "../../auth/middleware.js";
import { listPurchaseCategories, createPurchaseCategory, updatePurchaseCategory } from "./purchaseCategories.js";

// Monté sur /api/settings (voir app.ts) — jamais sur /api directement, pour
// que le .use() ci-dessous ne gate QUE les routes de ce module, pas tout
// /api/* (un .use() sans chemin sur un routeur monté à la racine "/api"
// intercepterait aussi les requêtes vers des routes complètement différentes).
export const settingsRouter = Router();

// Toute la section Paramètres est Direction seulement, sans exception (canAccessSettings, roles.ts) —
// même porte appliquée uniformément à chaque route de ce module, pas seulement à l'affichage.
settingsRouter.use(requireAuth, requirePermission((persona) => canAccessSettings(persona)));

settingsRouter.get("/purchase-categories", async (_req, res) => {
  const categories = await listPurchaseCategories();
  res.json({ categories });
});

const createSchema = z.object({
  name: z.string().min(1, "Le nom est requis."),
  thresholdAmount: z.number().nonnegative("Le seuil est requis."),
});
settingsRouter.post("/purchase-categories", async (req, res) => {
  const body = createSchema.parse(req.body);
  const category = await createPurchaseCategory(body.name, body.thresholdAmount);
  res.status(201).json({ category });
});

const updateSchema = z.object({
  name: z.string().min(1).optional(),
  thresholdAmount: z.number().nonnegative().optional(),
  active: z.boolean().optional(),
});
settingsRouter.patch("/purchase-categories/:id", async (req, res) => {
  const id = z.uuid().parse(req.params.id);
  const body = updateSchema.parse(req.body);
  const category = await updatePurchaseCategory(id, body);
  res.json({ category });
});
