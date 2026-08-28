import { Router } from "express";
import { z } from "zod";
import {
  canAccessOverviewViews,
  canCreateRollingDirectly,
  canMarkProductionComplete,
  canChooseFulfillmentMode,
  canManagePostMortem,
  canArchiveRolling,
  canDeleteRolling,
  canSeeFinancialValues,
} from "@gsc-pilot/business-rules";
import { requireAuth, requirePermission } from "../../auth/middleware.js";
import {
  listRollings,
  getRollingDetail,
  createRollingDirect,
  updateRollingSold,
  getRollingInvoicePlan,
  markRollingProductionComplete,
  chooseRollingFulfillmentMode,
  confirmRollingFulfillment,
  getRollingPostMortem,
  updateRollingPostMortemAnalysis,
  setRollingArchived,
  deleteRolling,
  getApprovedRollingTimeEntries,
} from "./service.js";

// Monté sur /api directement (voir app.ts) — chaque route applique donc
// requireAuth/requirePermission elle-même, même patron que deliveries/reports.
export const rollingsRouter = Router();

rollingsRouter.get("/rollings", requireAuth, requirePermission((persona) => canAccessOverviewViews(persona)), async (req, res) => {
  const rollings = await listRollings(req.employee!.persona);
  res.json({ rollings });
});

rollingsRouter.get("/rollings/:id", requireAuth, requirePermission((persona) => canAccessOverviewViews(persona)), async (req, res) => {
  const id = z.uuid().parse(req.params.id);
  const rolling = await getRollingDetail(id, req.employee!.persona);
  res.json({ rolling });
});

const newContactSchema = z.object({
  contactName: z.string().min(1, "Le nom du contact est requis."),
  company: z.string().optional(),
  contactRole: z.string().optional(),
  phone: z.string().optional(),
  email: z.string().optional(),
});
rollingsRouter.post("/rollings", requireAuth, requirePermission((persona) => canCreateRollingDirectly(persona)), async (req, res) => {
  const newContact = newContactSchema.parse(req.body);
  const rolling = await createRollingDirect(req.employee!.id, newContact);
  res.status(201).json({ rolling });
});

const soldSchema = z.object({ sold: z.number().nonnegative() });
rollingsRouter.patch(
  "/rollings/:id/sold",
  requireAuth,
  requirePermission((persona) => canCreateRollingDirectly(persona)),
  async (req, res) => {
    const id = z.uuid().parse(req.params.id);
    const { sold } = soldSchema.parse(req.body);
    await updateRollingSold(id, sold);
    res.status(204).end();
  },
);

rollingsRouter.get(
  "/rollings/:id/invoice-plan",
  requireAuth,
  requirePermission((persona) => canAccessOverviewViews(persona)),
  async (req, res) => {
    const id = z.uuid().parse(req.params.id);
    const plan = await getRollingInvoicePlan(id);
    res.json({ plan });
  },
);

rollingsRouter.post(
  "/rollings/:id/production-complete",
  requireAuth,
  requirePermission((persona) => canMarkProductionComplete(persona)),
  async (req, res) => {
    const id = z.uuid().parse(req.params.id);
    await markRollingProductionComplete(id);
    res.status(204).end();
  },
);

// "installation" jamais accepté ici — seuls les 3 modes classiques ont un
// sens pour un roulement (voir rollings/service.ts).
const fulfillmentModeSchema = z.object({
  mode: z.enum(["warehouse", "manual", "pickup"]),
  driverId: z.uuid().nullable().optional(),
  address: z.string().optional(),
  scheduled: z.iso.date().nullable().optional(),
});
rollingsRouter.post(
  "/rollings/:id/fulfillment-mode",
  requireAuth,
  requirePermission((persona) => canChooseFulfillmentMode(persona)),
  async (req, res) => {
    const id = z.uuid().parse(req.params.id);
    const body = fulfillmentModeSchema.parse(req.body);
    await chooseRollingFulfillmentMode(id, body);
    res.status(204).end();
  },
);

const confirmFulfillmentSchema = z.object({ note: z.string().optional() });
rollingsRouter.post(
  "/rollings/:id/fulfillment-confirm",
  requireAuth,
  requirePermission((persona) => canChooseFulfillmentMode(persona)),
  async (req, res) => {
    const id = z.uuid().parse(req.params.id);
    const { note } = confirmFulfillmentSchema.parse(req.body);
    await confirmRollingFulfillment(id, note);
    res.status(204).end();
  },
);

rollingsRouter.get(
  "/rollings/:id/post-mortem",
  requireAuth,
  requirePermission((persona) => canAccessOverviewViews(persona)),
  async (req, res) => {
    const id = z.uuid().parse(req.params.id);
    const postMortem = await getRollingPostMortem(id, req.employee!.persona);
    res.json({ postMortem });
  },
);

const postMortemSchema = z.object({
  depassements: z.string().optional(),
  ameliorations: z.string().optional(),
  recommandation: z.string().optional(),
});
rollingsRouter.get(
  "/rollings/:id/approved-hours",
  requireAuth,
  requirePermission((persona) => canAccessOverviewViews(persona)),
  async (req, res) => {
    const id = z.uuid().parse(req.params.id);
    const entries = await getApprovedRollingTimeEntries(id, canSeeFinancialValues(req.employee!.persona));
    res.json({ entries });
  },
);

rollingsRouter.patch(
  "/rollings/:id/archived",
  requireAuth,
  requirePermission((persona) => canArchiveRolling(persona)),
  async (req, res) => {
    const id = z.uuid().parse(req.params.id);
    const { archived } = z.object({ archived: z.boolean() }).parse(req.body);
    await setRollingArchived(id, archived);
    res.status(204).end();
  },
);

rollingsRouter.delete(
  "/rollings/:id",
  requireAuth,
  requirePermission((persona) => canDeleteRolling(persona)),
  async (req, res) => {
    const id = z.uuid().parse(req.params.id);
    await deleteRolling(id);
    res.status(204).end();
  },
);

rollingsRouter.patch(
  "/rollings/:id/post-mortem",
  requireAuth,
  requirePermission((persona) => canManagePostMortem(persona)),
  async (req, res) => {
    const id = z.uuid().parse(req.params.id);
    const body = postMortemSchema.parse(req.body);
    await updateRollingPostMortemAnalysis(id, body);
    res.status(204).end();
  },
);
