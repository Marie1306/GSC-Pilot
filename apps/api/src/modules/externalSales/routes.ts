import { Router } from "express";
import { z } from "zod";
import { canManageExternalSales, FULFILLMENT_MODES, type FulfillmentMode } from "@gsc-pilot/business-rules";
import { requireAuth, requirePermission } from "../../auth/middleware.js";
import {
  createExternalSale,
  listExternalSales,
  getExternalSaleDetail,
  markExternalSaleReadyToDeliver,
  chooseExternalSaleFulfillmentMode,
  confirmExternalSaleFulfillment,
  getNextExternalSaleDisplayId,
} from "./service.js";

export const externalSalesRouter = Router();

const canManage = (persona: Parameters<typeof canManageExternalSales>[0]) => canManageExternalSales(persona);

/** Aperçu du prochain numéro + marge par défaut — pour la fenêtre de création (Ajouter rapidement inclus). */
externalSalesRouter.get("/external-sales/next-number", requireAuth, requirePermission(canManage), async (_req, res) => {
  const result = await getNextExternalSaleDisplayId();
  res.json(result);
});

externalSalesRouter.get("/external-sales", requireAuth, requirePermission(canManage), async (_req, res) => {
  const externalSales = await listExternalSales();
  res.json({ externalSales });
});

externalSalesRouter.get("/external-sales/:id", requireAuth, requirePermission(canManage), async (req, res) => {
  const id = z.uuid().parse(req.params.id);
  const detail = await getExternalSaleDetail(id, req.employee!.persona);
  res.json(detail);
});

const lineSchema = z.object({
  description: z.string().min(1, "La description est requise."),
  qty: z.number().positive(),
  unitCost: z.number().nonnegative(),
});
const newContactSchema = z.object({
  contactName: z.string().min(1, "Le nom du contact est requis."),
  company: z.string().trim().optional(),
  contactRole: z.string().trim().optional(),
  phone: z.string().trim().optional(),
  email: z.string().trim().optional(),
});
const createExternalSaleSchema = z.object({
  clientRequestId: z.uuid().optional(),
  newContact: newContactSchema,
  lines: z.array(lineSchema).min(1, "Au moins une ligne de pièce est requise."),
  // Frais de transport/administratifs : montants fixes en $, jamais un %,
  // jamais de valeur par défaut (confirmé explicitement par l'utilisatrice)
  // — 0 accepté (frais non applicables à cette vente), jamais négatif.
  transportFee: z.number().nonnegative(),
  adminFee: z.number().nonnegative(),
  marginPct: z.number().min(0).max(99.99),
});

externalSalesRouter.post("/external-sales", requireAuth, requirePermission(canManage), async (req, res) => {
  const body = createExternalSaleSchema.parse(req.body);
  const sale = await createExternalSale(req.employee!.id, body);
  res.status(201).json({ id: sale.id, displayId: sale.displayId });
});

externalSalesRouter.post("/external-sales/:id/ready-to-deliver", requireAuth, requirePermission(canManage), async (req, res) => {
  const id = z.uuid().parse(req.params.id);
  await markExternalSaleReadyToDeliver(id);
  res.status(204).end();
});

/** Les 4 modes existants réutilisés tels quels (confirmé — pas 2 nouveaux modes simplifiés). Même schéma que projects/routes.ts. */
const fulfillmentModeSchema = z.object({
  mode: z.enum(Object.values(FULFILLMENT_MODES) as [string, ...string[]]),
  driverId: z.uuid().optional(),
  address: z.string().optional(),
  scheduled: z.iso.date().optional(),
});
externalSalesRouter.post("/external-sales/:id/fulfillment", requireAuth, requirePermission(canManage), async (req, res) => {
  const id = z.uuid().parse(req.params.id);
  const body = fulfillmentModeSchema.parse(req.body);
  await chooseExternalSaleFulfillmentMode(id, { ...body, mode: body.mode as FulfillmentMode });
  res.status(204).end();
});

externalSalesRouter.post("/external-sales/:id/fulfillment/confirm", requireAuth, requirePermission(canManage), async (req, res) => {
  const id = z.uuid().parse(req.params.id);
  const { note } = z.object({ note: z.string().optional() }).parse(req.body ?? {});
  await confirmExternalSaleFulfillment(id, note);
  res.status(204).end();
});
