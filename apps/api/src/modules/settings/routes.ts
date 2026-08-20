import { Router } from "express";
import { z } from "zod";
import { canAccessSettings, canSeeFinancialValues } from "@gsc-pilot/business-rules";
import { requireAuth, requirePermission } from "../../auth/middleware.js";
import { listPurchaseCategories, createPurchaseCategory, updatePurchaseCategory } from "./purchaseCategories.js";
import { getMarginThresholds, updateMarginThresholds } from "./marginThresholds.js";
import { listTechLevels, createTechLevel, updateTechLevel, scrubTechLevelRates } from "./techLevels.js";

// Monté sur /api/settings (voir app.ts) — jamais sur /api directement, pour
// que le .use() ci-dessous ne gate QUE les routes de ce module, pas tout
// /api/* (un .use() sans chemin sur un routeur monté à la racine "/api"
// intercepterait aussi les requêtes vers des routes complètement différentes).
export const settingsRouter = Router();

/**
 * Exception délibérée à la porte Direction seulement ci-dessous : chaque
 * employé doit pouvoir lire le LIBELLÉ de ses propres classes facturables
 * pour les choisir au punch (confirmé le 18-19 août 2026 — un employé peut
 * avoir plusieurs classes, celle qui s'applique se choisit à chaque punch,
 * pas seulement par Direction). Route déclarée AVANT le .use() ci-dessous
 * pour échapper au blocage canAccessSettings — bogue réel trouvé en testant
 * avec le compte Employé (19 août 2026) : la liste des classes n'apparaissait
 * jamais, peu importe l'assignation faite côté Direction. Les taux $/h
 * restent retirés pour Employé/Magasinier (canSeeFinancialValues, même
 * principe transversal que partout ailleurs) — seul le libellé leur est
 * nécessaire pour choisir la bonne classe.
 */
settingsRouter.get("/tech-levels", requireAuth, async (req, res) => {
  const techLevels = await listTechLevels();
  const showRates = canSeeFinancialValues(req.employee!.persona);
  res.json({ techLevels: showRates ? techLevels : scrubTechLevelRates(techLevels) });
});

// Toute la section Paramètres est Direction seulement, sans exception (canAccessSettings, roles.ts) —
// même porte appliquée uniformément à chaque route de ce module, pas seulement à l'affichage.
// Exception unique : GET /tech-levels ci-dessus, déclarée avant cette porte.
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

settingsRouter.get("/margin-thresholds", async (_req, res) => {
  const thresholds = await getMarginThresholds();
  res.json({ thresholds });
});

const marginThresholdsSchema = z.object({
  conformeThreshold: z.number().min(0).max(100),
  atRiskThreshold: z.number().min(0).max(100),
});
settingsRouter.patch("/margin-thresholds", async (req, res) => {
  const body = marginThresholdsSchema.parse(req.body);
  const thresholds = await updateMarginThresholds(body);
  res.json({ thresholds });
});

const createTechLevelSchema = z.object({
  label: z.string().min(1, "Le nom est requis."),
  regularRate: z.number().nonnegative(),
  overtimeRate: z.number().nonnegative(),
  extraRate: z.number().nonnegative(),
});
settingsRouter.post("/tech-levels", async (req, res) => {
  const body = createTechLevelSchema.parse(req.body);
  const techLevel = await createTechLevel(body);
  res.status(201).json({ techLevel });
});

const updateTechLevelSchema = z.object({
  label: z.string().min(1).optional(),
  regularRate: z.number().nonnegative().optional(),
  overtimeRate: z.number().nonnegative().optional(),
  extraRate: z.number().nonnegative().optional(),
  active: z.boolean().optional(),
});
settingsRouter.patch("/tech-levels/:id", async (req, res) => {
  const id = z.uuid().parse(req.params.id);
  const body = updateTechLevelSchema.parse(req.body);
  const techLevel = await updateTechLevel(id, body);
  res.json({ techLevel });
});
