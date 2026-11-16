import { Router } from "express";
import { z } from "zod";
import {
  canCreateServiceCall,
  canAccessServiceCalls,
  canReassignServiceCall,
  canCreateBonDeTravail,
  canPriceServiceParts,
  canApproveServiceCall,
  canConfirmInvoiceRequest,
  canDeleteServiceCall,
} from "@gsc-pilot/business-rules";
import { requireAuth, requirePermission } from "../../auth/middleware.js";
import { prisma } from "../../db.js";
import {
  createServiceCall,
  listServiceCalls,
  getServiceCallDetail,
  updateServiceCall,
  createBonDeTravail,
  getBonDeTravailDetail,
  updateBonDeTravail,
  addServiceCallPart,
  removeServiceCallPart,
  priceServiceCallPart,
  captureBonDeTravailSignature,
  approveBonDeTravail,
  listInvoiceableBonsDeTravail,
  previewServiceCallInvoiceForSelection,
  createServiceCallInvoiceForSelection,
  deleteServiceCall,
  getNextServiceCallDisplayId,
} from "./service.js";

// Monté sur /api directement (voir app.ts, comme budgetsRouter/purchasesRouter)
// — chaque route applique donc requireAuth/requirePermission elle-même,
// jamais un .use() global sans chemin sur ce routeur.
export const serviceCallsRouter = Router();

/** Aperçu pour la modale « Ajouter rapidement » (23 août 2026) — mêmes rôles que la création. */
serviceCallsRouter.get(
  "/service-calls/next-number",
  requireAuth,
  requirePermission((persona) => canCreateServiceCall(persona)),
  async (_req, res) => {
    const nextDisplayId = await getNextServiceCallDisplayId();
    res.json({ nextDisplayId });
  },
);

serviceCallsRouter.get("/service-calls", requireAuth, requirePermission((persona) => canAccessServiceCalls(persona)), async (req, res) => {
  const employee = req.employee!;
  const serviceCalls = await listServiceCalls(employee.persona, employee.id);
  res.json({ serviceCalls });
});

serviceCallsRouter.get("/service-calls/:id", requireAuth, requirePermission((persona) => canAccessServiceCalls(persona)), async (req, res) => {
  const id = z.uuid().parse(req.params.id);
  const serviceCall = await getServiceCallDetail(id);
  res.json({ serviceCall });
});

const newContactSchema = z.object({
  contactName: z.string().min(1),
  company: z.string().optional(),
  contactRole: z.string().optional(),
  phone: z.string().optional(),
  email: z.email().optional(),
});
const createSchema = z.object({
  contactId: z.uuid().optional(),
  newContact: newContactSchema.optional(),
  title: z.string().min(1, "Le titre du call est requis."),
  request: z.string().min(1, "La description de la demande est requise."),
  address: z.string().optional(),
  assignedEmployeeIds: z.array(z.uuid()).optional(),
  clientRequestId: z.uuid().optional(),
  projectId: z.uuid().optional(),
  rollingId: z.uuid().optional(),
});
serviceCallsRouter.post("/service-calls", requireAuth, requirePermission((persona) => canCreateServiceCall(persona)), async (req, res) => {
  const body = createSchema.parse(req.body);
  const serviceCall = await createServiceCall(body);
  res.status(201).json({ id: serviceCall.id, displayId: serviceCall.displayId });
});

/** Seul assignedEmployeeIds reste modifiable au niveau du Call (tout le reste a déménagé vers Bon de travail). */
const updateSchema = z.object({ assignedEmployeeIds: z.array(z.uuid()).optional() });
serviceCallsRouter.patch("/service-calls/:id", requireAuth, requirePermission((persona) => canAccessServiceCalls(persona)), async (req, res) => {
  const id = z.uuid().parse(req.params.id);
  const body = updateSchema.parse(req.body);
  if (body.assignedEmployeeIds !== undefined && !canReassignServiceCall(req.employee!.persona)) {
    res.status(403).json({ error: "forbidden" });
    return;
  }
  await updateServiceCall(id, body);
  res.status(204).end();
});

/** Corbeille — Direction seulement (canDeleteServiceCall, même palier que budgétaire/projet/demande client). */
serviceCallsRouter.delete(
  "/service-calls/:id",
  requireAuth,
  requirePermission((persona) => canDeleteServiceCall(persona)),
  async (req, res) => {
    const id = z.uuid().parse(req.params.id);
    await deleteServiceCall(id);
    res.status(204).end();
  },
);

// ---------------------------------------------------------------------------
// Bons de travail (Chantier D, 16 novembre 2026)
// ---------------------------------------------------------------------------

const createBonDeTravailSchema = z.object({
  assignedEmployeeIds: z.array(z.uuid()).optional(),
  scheduledAt: z.string().optional(),
});
serviceCallsRouter.post(
  "/service-calls/:id/bons-travail",
  requireAuth,
  requirePermission((persona) => canAccessServiceCalls(persona)),
  async (req, res) => {
    const serviceCallId = z.uuid().parse(req.params.id);
    const body = createBonDeTravailSchema.parse(req.body);
    const call = await prisma.serviceCall.findUnique({ where: { id: serviceCallId }, include: { assignedEmployees: { select: { id: true } } } });
    if (!call || call.deletedAt) {
      res.status(404).json({ error: "not_found" });
      return;
    }
    if (!canCreateBonDeTravail(req.employee!.persona, call, req.employee!.id)) {
      res.status(403).json({ error: "forbidden" });
      return;
    }
    // Un technicien qui crée son propre Bon de travail est par défaut celui
    // qui y est allé, sans devoir se re-sélectionner — Direction (catch-up)
    // garde le choix explicite, vide par défaut.
    const assignedEmployeeIds = body.assignedEmployeeIds?.length
      ? body.assignedEmployeeIds
      : req.employee!.persona === "member"
        ? [req.employee!.id]
        : undefined;
    const bonDeTravail = await createBonDeTravail(serviceCallId, req.employee!.id, { ...body, assignedEmployeeIds });
    res.status(201).json(bonDeTravail);
  },
);

serviceCallsRouter.get(
  "/service-calls/bons-travail/:id",
  requireAuth,
  requirePermission((persona) => canAccessServiceCalls(persona)),
  async (req, res) => {
    const id = z.uuid().parse(req.params.id);
    const bonDeTravail = await getBonDeTravailDetail(id, req.employee!.persona);
    res.json({ bonDeTravail });
  },
);

const updateBonDeTravailSchema = z.object({
  assignedEmployeeIds: z.array(z.uuid()).optional(),
  scheduledAt: z.string().nullable().optional(),
  kmTraveled: z.number().nonnegative().nullable().optional(),
  mealsBreakfastCount: z.number().int().nonnegative().optional(),
  mealsLunchCount: z.number().int().nonnegative().optional(),
  mealsDinnerCount: z.number().int().nonnegative().optional(),
  summary: z.string().nullable().optional(),
});
serviceCallsRouter.patch(
  "/service-calls/bons-travail/:id",
  requireAuth,
  requirePermission((persona) => canAccessServiceCalls(persona)),
  async (req, res) => {
    const id = z.uuid().parse(req.params.id);
    const body = updateBonDeTravailSchema.parse(req.body);
    if (body.assignedEmployeeIds !== undefined && !canReassignServiceCall(req.employee!.persona)) {
      res.status(403).json({ error: "forbidden" });
      return;
    }
    await updateBonDeTravail(id, body);
    res.status(204).end();
  },
);

const addPartSchema = z.object({ name: z.string().min(1), qty: z.number().positive(), unit: z.string().optional() });
serviceCallsRouter.post(
  "/service-calls/bons-travail/:id/parts",
  requireAuth,
  requirePermission((persona) => canAccessServiceCalls(persona)),
  async (req, res) => {
    const id = z.uuid().parse(req.params.id);
    const body = addPartSchema.parse(req.body);
    const part = await addServiceCallPart(id, body);
    res.status(201).json({ part });
  },
);

serviceCallsRouter.delete(
  "/service-calls/parts/:partId",
  requireAuth,
  requirePermission((persona) => canAccessServiceCalls(persona)),
  async (req, res) => {
    const partId = z.uuid().parse(req.params.partId);
    await removeServiceCallPart(partId);
    res.status(204).end();
  },
);

const pricePartSchema = z.object({ costPerUnit: z.number().nonnegative(), marginPctOverride: z.number().min(0).max(99.99).optional() });
serviceCallsRouter.patch(
  "/service-calls/parts/:partId/price",
  requireAuth,
  requirePermission((persona) => canPriceServiceParts(persona)),
  async (req, res) => {
    const partId = z.uuid().parse(req.params.partId);
    const body = pricePartSchema.parse(req.body);
    const part = await priceServiceCallPart(partId, req.employee!.id, body);
    res.json({ part });
  },
);

const signatureSchema = z.object({ dataUrl: z.string().min(1), signerName: z.string().min(1, "Le nom du signataire est requis.") });
serviceCallsRouter.post(
  "/service-calls/bons-travail/:id/signature",
  requireAuth,
  requirePermission((persona) => canAccessServiceCalls(persona)),
  async (req, res) => {
    const id = z.uuid().parse(req.params.id);
    const { dataUrl, signerName } = signatureSchema.parse(req.body);
    await captureBonDeTravailSignature(id, dataUrl, signerName);
    res.status(204).end();
  },
);

serviceCallsRouter.post(
  "/service-calls/bons-travail/:id/approve",
  requireAuth,
  requirePermission((persona) => canApproveServiceCall(persona)),
  async (req, res) => {
    const id = z.uuid().parse(req.params.id);
    await approveBonDeTravail(id, req.employee!.id);
    res.status(204).end();
  },
);

// ---------------------------------------------------------------------------
// Facturation sélective (Chantier D) — remplace invoice-preview/send-to-admin
// ---------------------------------------------------------------------------

serviceCallsRouter.get(
  "/service-calls/:id/invoiceable-bons-travail",
  requireAuth,
  requirePermission((persona) => canConfirmInvoiceRequest(persona)),
  async (req, res) => {
    const id = z.uuid().parse(req.params.id);
    const bonsDeTravail = await listInvoiceableBonsDeTravail(id);
    res.json({ bonsDeTravail });
  },
);

const selectionSchema = z.object({ bonDeTravailIds: z.array(z.uuid()).min(1, "Sélectionner au moins un bon de travail.") });
serviceCallsRouter.post(
  "/service-calls/:id/invoice-selection/preview",
  requireAuth,
  requirePermission((persona) => canConfirmInvoiceRequest(persona)),
  async (req, res) => {
    const id = z.uuid().parse(req.params.id);
    const { bonDeTravailIds } = selectionSchema.parse(req.body);
    const preview = await previewServiceCallInvoiceForSelection(id, bonDeTravailIds);
    res.json({ preview });
  },
);

const confirmSelectionSchema = selectionSchema.extend({ note: z.string().optional() });
serviceCallsRouter.post(
  "/service-calls/:id/invoice-selection/confirm",
  requireAuth,
  requirePermission((persona) => canConfirmInvoiceRequest(persona)),
  async (req, res) => {
    const id = z.uuid().parse(req.params.id);
    const { bonDeTravailIds, note } = confirmSelectionSchema.parse(req.body);
    const entry = await createServiceCallInvoiceForSelection(id, bonDeTravailIds, req.employee!.id, note);
    res.json({ entry });
  },
);
