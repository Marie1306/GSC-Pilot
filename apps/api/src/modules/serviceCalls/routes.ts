import { Router } from "express";
import { z } from "zod";
import {
  canCreateServiceCall,
  canAccessServiceCalls,
  canReassignServiceCall,
  canPriceServiceParts,
  canApproveServiceCall,
  canSendServiceCallToAdmin,
} from "@gsc-pilot/business-rules";
import { requireAuth, requirePermission } from "../../auth/middleware.js";
import {
  createServiceCall,
  listServiceCalls,
  getServiceCallDetail,
  updateServiceCall,
  addServiceCallPart,
  removeServiceCallPart,
  priceServiceCallPart,
  captureServiceCallSignature,
  approveServiceCall,
  sendServiceCallToAdmin,
} from "./service.js";

// Monté sur /api directement (voir app.ts, comme budgetsRouter/purchasesRouter)
// — chaque route applique donc requireAuth/requirePermission elle-même,
// jamais un .use() global sans chemin sur ce routeur (interceptait aussi
// des requêtes complètement étrangères à ce module, voir settings/routes.ts).
export const serviceCallsRouter = Router();

serviceCallsRouter.get("/service-calls", requireAuth, requirePermission((persona) => canAccessServiceCalls(persona)), async (req, res) => {
  const employee = req.employee!;
  const serviceCalls = await listServiceCalls(employee.persona, employee.id);
  res.json({ serviceCalls });
});

serviceCallsRouter.get("/service-calls/:id", requireAuth, requirePermission((persona) => canAccessServiceCalls(persona)), async (req, res) => {
  const id = z.uuid().parse(req.params.id);
  const serviceCall = await getServiceCallDetail(id, req.employee!.persona);
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
  request: z.string().min(1, "La description de la demande est requise."),
  assignedEmployeeIds: z.array(z.uuid()).optional(),
  scheduledAt: z.string().optional(),
});
serviceCallsRouter.post("/service-calls", requireAuth, requirePermission((persona) => canCreateServiceCall(persona)), async (req, res) => {
  const body = createSchema.parse(req.body);
  const serviceCall = await createServiceCall(body);
  res.status(201).json({ id: serviceCall.id, displayId: serviceCall.displayId });
});

const updateSchema = z.object({
  assignedEmployeeIds: z.array(z.uuid()).optional(),
  scheduledAt: z.string().nullable().optional(),
  kmTraveled: z.number().nonnegative().nullable().optional(),
  mealsClaimed: z.array(z.enum(["breakfast", "lunch", "dinner"])).optional(),
  summary: z.string().nullable().optional(),
});
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

const addPartSchema = z.object({ name: z.string().min(1), qty: z.number().positive(), unit: z.string().optional() });
serviceCallsRouter.post(
  "/service-calls/:id/parts",
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

const signatureSchema = z.object({ dataUrl: z.string().min(1) });
serviceCallsRouter.post(
  "/service-calls/:id/signature",
  requireAuth,
  requirePermission((persona) => canAccessServiceCalls(persona)),
  async (req, res) => {
    const id = z.uuid().parse(req.params.id);
    const { dataUrl } = signatureSchema.parse(req.body);
    await captureServiceCallSignature(id, dataUrl);
    res.status(204).end();
  },
);

serviceCallsRouter.post(
  "/service-calls/:id/approve",
  requireAuth,
  requirePermission((persona) => canApproveServiceCall(persona)),
  async (req, res) => {
    const id = z.uuid().parse(req.params.id);
    await approveServiceCall(id, req.employee!.id);
    res.status(204).end();
  },
);

serviceCallsRouter.post(
  "/service-calls/:id/send-to-admin",
  requireAuth,
  requirePermission((persona) => canSendServiceCallToAdmin(persona)),
  async (req, res) => {
    const id = z.uuid().parse(req.params.id);
    await sendServiceCallToAdmin(id);
    res.status(204).end();
  },
);
