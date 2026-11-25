import { Router } from "express";
import { z } from "zod";
import { canManageExternalSales } from "@gsc-pilot/business-rules";
import { requireAuth, requirePermission } from "../../auth/middleware.js";
import {
  convertExternalSaleQuoteToConfirmation,
  getExternalSaleConfirmationDetail,
  getConfirmationForExternalSaleQuote,
  deleteExternalSaleConfirmation,
} from "./service.js";

export const externalSaleConfirmationsRouter = Router();

// Même trio que le reste du module Vente externe (décision confirmée avec
// Marie le 25 novembre 2026) — pas canManageSoumission (plus étroit), qui
// gouverne la Confirmation de commande de Projet/Roulement.
const canManage = (persona: Parameters<typeof canManageExternalSales>[0]) => canManageExternalSales(persona);

const convertSchema = z.object({ clientPoNumber: z.string().trim().optional() });
externalSaleConfirmationsRouter.post("/external-sale-quotes/:quoteId/confirmation", requireAuth, requirePermission(canManage), async (req, res) => {
  const quoteId = z.uuid().parse(req.params.quoteId);
  const body = convertSchema.parse(req.body);
  const confirmation = await convertExternalSaleQuoteToConfirmation(quoteId, req.employee!.id, body);
  res.status(201).json({ confirmation });
});

externalSaleConfirmationsRouter.get("/external-sale-quotes/:quoteId/confirmation", requireAuth, requirePermission(canManage), async (req, res) => {
  const quoteId = z.uuid().parse(req.params.quoteId);
  const confirmation = await getConfirmationForExternalSaleQuote(quoteId);
  res.json({ confirmation });
});

externalSaleConfirmationsRouter.get("/external-sale-confirmations/:id", requireAuth, requirePermission(canManage), async (req, res) => {
  const id = z.uuid().parse(req.params.id);
  const confirmation = await getExternalSaleConfirmationDetail(id);
  res.json({ confirmation });
});

externalSaleConfirmationsRouter.delete("/external-sale-confirmations/:id", requireAuth, requirePermission(canManage), async (req, res) => {
  const id = z.uuid().parse(req.params.id);
  await deleteExternalSaleConfirmation(id);
  res.status(204).end();
});
