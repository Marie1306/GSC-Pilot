import { Router } from "express";
import { z } from "zod";
import { canManageExternalSales } from "@gsc-pilot/business-rules";
import { requireAuth, requirePermission } from "../../auth/middleware.js";
import {
  getNextExternalSaleQuoteDisplayId,
  listExternalSaleQuotes,
  getExternalSaleQuoteDetail,
  createExternalSaleQuote,
  updateExternalSaleQuote,
  sendExternalSaleQuote,
  decideExternalSaleQuote,
  deleteExternalSaleQuote,
  convertExternalSaleQuoteToSale,
} from "./service.js";

export const externalSaleQuotesRouter = Router();

/** Même porte que le reste du module Vente externe (canManageExternalSales, [OWNER,ADMIN,BOSS]) — confirmé, aucune raison de restreindre spécifiquement ce cycle-ci. */
const canManage = (persona: Parameters<typeof canManageExternalSales>[0]) => canManageExternalSales(persona);

externalSaleQuotesRouter.get("/external-sale-quotes/next-number", requireAuth, requirePermission(canManage), async (_req, res) => {
  res.json(await getNextExternalSaleQuoteDisplayId());
});

externalSaleQuotesRouter.get("/external-sale-quotes", requireAuth, requirePermission(canManage), async (_req, res) => {
  const quotes = await listExternalSaleQuotes();
  res.json({ quotes });
});

externalSaleQuotesRouter.get("/external-sale-quotes/:id", requireAuth, requirePermission(canManage), async (req, res) => {
  const id = z.uuid().parse(req.params.id);
  res.json(await getExternalSaleQuoteDetail(id));
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
const createExternalSaleQuoteSchema = z.object({
  clientRequestId: z.uuid().optional(),
  newContact: newContactSchema,
  lines: z.array(lineSchema).min(1, "Au moins une ligne de pièce est requise."),
  transportFee: z.number().nonnegative(),
  adminFee: z.number().nonnegative(),
  marginPct: z.number().min(0).max(99.99),
  introText: z.string().optional(),
  termsText: z.string().optional(),
});

externalSaleQuotesRouter.post("/external-sale-quotes", requireAuth, requirePermission(canManage), async (req, res) => {
  const body = createExternalSaleQuoteSchema.parse(req.body);
  const quote = await createExternalSaleQuote(req.employee!.id, body);
  res.status(201).json({ id: quote.id, displayId: quote.displayId });
});

const updateExternalSaleQuoteSchema = z.object({
  newContact: newContactSchema.optional(),
  lines: z.array(lineSchema).min(1, "Au moins une ligne de pièce est requise.").optional(),
  transportFee: z.number().nonnegative().optional(),
  adminFee: z.number().nonnegative().optional(),
  marginPct: z.number().min(0).max(99.99).optional(),
  introText: z.string().optional(),
  termsText: z.string().optional(),
});
externalSaleQuotesRouter.patch("/external-sale-quotes/:id", requireAuth, requirePermission(canManage), async (req, res) => {
  const id = z.uuid().parse(req.params.id);
  const body = updateExternalSaleQuoteSchema.parse(req.body);
  await updateExternalSaleQuote(id, body);
  res.status(204).end();
});

externalSaleQuotesRouter.post("/external-sale-quotes/:id/send", requireAuth, requirePermission(canManage), async (req, res) => {
  const id = z.uuid().parse(req.params.id);
  await sendExternalSaleQuote(id);
  res.status(204).end();
});

const decideSchema = z.object({ outcome: z.enum(["accepted", "declined"]) });
externalSaleQuotesRouter.post("/external-sale-quotes/:id/decide", requireAuth, requirePermission(canManage), async (req, res) => {
  const id = z.uuid().parse(req.params.id);
  const { outcome } = decideSchema.parse(req.body);
  await decideExternalSaleQuote(id, outcome);
  res.status(204).end();
});

externalSaleQuotesRouter.post("/external-sale-quotes/:id/convert", requireAuth, requirePermission(canManage), async (req, res) => {
  const id = z.uuid().parse(req.params.id);
  const sale = await convertExternalSaleQuoteToSale(id, req.employee!.id);
  res.status(201).json({ id: sale.id, displayId: sale.displayId });
});

externalSaleQuotesRouter.delete("/external-sale-quotes/:id", requireAuth, requirePermission(canManage), async (req, res) => {
  const id = z.uuid().parse(req.params.id);
  await deleteExternalSaleQuote(id);
  res.status(204).end();
});
