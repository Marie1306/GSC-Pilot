import { Router } from "express";
import { z } from "zod";
import {
  canAccessProject,
  canConvertBudgetToProject,
  canCreateProjectDirectly,
  canMarkProductionComplete,
  canChooseFulfillmentMode,
  canRequestInvoice,
  canCreateInvoiceRecord,
  canRecordPayment,
  canHoldInvoice,
  canManageWarranty,
  canManageProject,
  canArchiveProject,
  canDeleteProject,
  canManagePostMortem,
  canSeeFinancialValues,
  FULFILLMENT_MODES,
  type FulfillmentMode,
} from "@gsc-pilot/business-rules";
import { requireAuth, requirePermission } from "../../auth/middleware.js";
import { prisma } from "../../db.js";
import {
  listProjects,
  getProjectDetail,
  getNextProjectNumber,
  createProjectDirect,
  updateProjectPlanning,
  markProductionComplete,
  chooseProjectFulfillmentMode,
  confirmProjectFulfillment,
  getInvoicePlan,
  updateProjectBillingPlan,
  requestInvoice,
  recordInvoice,
  recordInvoicePayment,
  holdInvoiceEntry,
  releaseInvoiceHold,
  setWarrantyExpected,
  activateOrUpdateWarranty,
  getWarrantyHistory,
  updateProjectInfo,
  setProjectArchived,
  deleteProject,
  getProjectHistory,
  getPostMortem,
  updatePostMortemAnalysis,
  getApprovedTimeEntries,
  getApprovedPurchaseEntries,
} from "./service.js";

export const projectsRouter = Router();

/**
 * Liste minimale (id/numéro/nom) — pour l'instant seulement pour peupler
 * le sélecteur de projet de la liste rapide d'achats. L'écran Projets
 * complet (avec le résumé financier) vient dans une prochaine phase.
 *
 * Inclut les projets fermés en garantie active depuis la Phase 2D (17 août
 * 2026) : un projet fermé ET en garantie reste ouvert aux achats — ça ne
 * dépend pas du statut du projet (confirmé), un projet fermé sans garantie
 * active reste exclu.
 */
projectsRouter.get("/projects", requireAuth, async (_req, res) => {
  const projects = await prisma.project.findMany({
    where: { OR: [{ closedAt: null }, { warrantyEndsAt: { gt: new Date() } }] },
    select: { id: true, projectNumber: true, name: true },
    orderBy: { projectNumber: "asc" },
  });
  res.json({ projects });
});

/** Numéro suggéré pour préremplir le formulaire de conversion/création — Direction ou Propriétaire (mêmes rôles qui créent un projet). */
projectsRouter.get(
  "/projects/next-number",
  requireAuth,
  requirePermission((persona) => canConvertBudgetToProject(persona) || canCreateProjectDirectly(persona)),
  async (_req, res) => {
    const nextProjectNumber = await getNextProjectNumber();
    res.json({ nextProjectNumber });
  },
);

const newProjectContactSchema = z.object({
  contactName: z.string().min(1),
  company: z.string().optional(),
  contactRole: z.string().optional(),
  phone: z.string().optional(),
  email: z.email().optional(),
});
const createProjectSchema = z.object({
  name: z.string().min(1),
  projectNumber: z.string().optional(),
  newContact: newProjectContactSchema,
  clientRequestId: z.uuid().optional(),
});
/** Création directe, hors conversion d'un budgétaire — Direction et Propriétaire seulement (confirmé le 9 août 2026). */
projectsRouter.post("/projects", requireAuth, requirePermission((persona) => canCreateProjectDirectly(persona)), async (req, res) => {
  const body = createProjectSchema.parse(req.body);
  const project = await createProjectDirect(req.employee!.id, body);
  res.status(201).json({ id: project.id, projectNumber: project.projectNumber });
});

const updatePlanningSchema = z.object({
  sold: z.number().nonnegative().optional(),
  plannedHours: z.number().nonnegative().optional(),
  plannedPurchases: z.number().nonnegative().optional(),
  installationPlannedHours: z.number().nonnegative().optional(),
  installationPlannedCost: z.number().nonnegative().optional(),
});
/**
 * Remplir après coup les champs qu'un budgétaire aurait fournis — projets
 * sans budgétaire d'origine seulement (confirmé le 19 août 2026), mêmes
 * rôles que la création directe (canCreateProjectDirectly) : c'est la
 * suite de la même donnée, pas une permission distincte.
 */
projectsRouter.patch(
  "/projects/:id/planning",
  requireAuth,
  requirePermission((persona) => canCreateProjectDirectly(persona)),
  async (req, res) => {
    const id = z.uuid().parse(req.params.id);
    const body = updatePlanningSchema.parse(req.body);
    await updateProjectPlanning(id, body);
    res.status(204).end();
  },
);

/** Liste complète (financière) — Phase 1 du module Projet, 12 août 2026. */
projectsRouter.get("/projects/full", requireAuth, requirePermission((persona) => canAccessProject(persona)), async (req, res) => {
  const projects = await listProjects(req.employee!.persona);
  res.json({ projects });
});

projectsRouter.get("/projects/:id", requireAuth, requirePermission((persona) => canAccessProject(persona)), async (req, res) => {
  const id = z.uuid().parse(req.params.id);
  const project = await getProjectDetail(id, req.employee!.persona);
  res.json({ project });
});

// ---------------------------------------------------------------------------
// Production et sortie (Projet 2C, 17 août 2026)
// ---------------------------------------------------------------------------

projectsRouter.post(
  "/projects/:id/mark-production-complete",
  requireAuth,
  requirePermission((persona) => canMarkProductionComplete(persona)),
  async (req, res) => {
    const id = z.uuid().parse(req.params.id);
    await markProductionComplete(id);
    res.status(204).end();
  },
);

const fulfillmentModeSchema = z.object({
  mode: z.enum(Object.values(FULFILLMENT_MODES) as [string, ...string[]]),
  driverId: z.uuid().optional(),
  address: z.string().optional(),
  // Champ <input type="date"> côté interface (AAAA-MM-JJ) — jamais un
  // datetime complet, corrigé en même temps que le module Livraisons
  // (20 août 2026) puisque personne n'avait encore testé une date planifiée.
  scheduled: z.iso.date().optional(),
});
projectsRouter.post(
  "/projects/:id/fulfillment",
  requireAuth,
  requirePermission((persona) => canChooseFulfillmentMode(persona)),
  async (req, res) => {
    const id = z.uuid().parse(req.params.id);
    const body = fulfillmentModeSchema.parse(req.body);
    await chooseProjectFulfillmentMode(id, { ...body, mode: body.mode as FulfillmentMode });
    res.status(204).end();
  },
);

projectsRouter.post(
  "/projects/:id/fulfillment/confirm",
  requireAuth,
  requirePermission((persona) => canChooseFulfillmentMode(persona)),
  async (req, res) => {
    const id = z.uuid().parse(req.params.id);
    const { note } = z.object({ note: z.string().optional() }).parse(req.body ?? {});
    await confirmProjectFulfillment(id, note);
    res.status(204).end();
  },
);

// ---------------------------------------------------------------------------
// Cycle de facturation (Projet 2C, 17 août 2026)
// ---------------------------------------------------------------------------

projectsRouter.get(
  "/projects/:id/invoice-plan",
  requireAuth,
  requirePermission((persona) => canAccessProject(persona)),
  async (req, res) => {
    const id = z.uuid().parse(req.params.id);
    const entries = await getInvoicePlan(id);
    res.json({ entries });
  },
);

const updateBillingPlanSchema = z.object({
  steps: z.array(z.object({ label: z.string().min(1), pct: z.number().positive() })).min(1),
});
projectsRouter.put(
  "/projects/:id/invoice-plan",
  requireAuth,
  requirePermission((persona) => canRequestInvoice(persona)),
  async (req, res) => {
    const id = z.uuid().parse(req.params.id);
    const { steps } = updateBillingPlanSchema.parse(req.body);
    const entries = await updateProjectBillingPlan(id, steps);
    res.json({ entries });
  },
);

projectsRouter.post(
  "/invoice-plan/:entryId/request",
  requireAuth,
  requirePermission((persona) => canRequestInvoice(persona)),
  async (req, res) => {
    const entryId = z.uuid().parse(req.params.entryId);
    const entry = await requestInvoice(entryId, req.employee!.id);
    res.json({ entry });
  },
);

const recordInvoiceSchema = z.object({ invoiceNumber: z.string().min(1), dueDate: z.iso.date().optional() });
projectsRouter.post(
  "/invoice-plan/:entryId/record",
  requireAuth,
  requirePermission((persona) => canCreateInvoiceRecord(persona)),
  async (req, res) => {
    const entryId = z.uuid().parse(req.params.entryId);
    const body = recordInvoiceSchema.parse(req.body);
    const entry = await recordInvoice(entryId, req.employee!.id, body);
    res.json({ entry });
  },
);

projectsRouter.patch(
  "/invoice-plan/:entryId/payment",
  requireAuth,
  requirePermission((persona) => canRecordPayment(persona)),
  async (req, res) => {
    const entryId = z.uuid().parse(req.params.entryId);
    const { amount } = z.object({ amount: z.number().positive() }).parse(req.body);
    const entry = await recordInvoicePayment(entryId, amount);
    res.json({ entry });
  },
);

projectsRouter.patch(
  "/invoice-plan/:entryId/hold",
  requireAuth,
  requirePermission((persona) => canHoldInvoice(persona)),
  async (req, res) => {
    const entryId = z.uuid().parse(req.params.entryId);
    const entry = await holdInvoiceEntry(entryId);
    res.json({ entry });
  },
);

projectsRouter.patch(
  "/invoice-plan/:entryId/release-hold",
  requireAuth,
  requirePermission((persona) => canHoldInvoice(persona)),
  async (req, res) => {
    const entryId = z.uuid().parse(req.params.entryId);
    const entry = await releaseInvoiceHold(entryId);
    res.json({ entry });
  },
);

// ---------------------------------------------------------------------------
// Garantie (Projet 2D, 17 août 2026)
// ---------------------------------------------------------------------------

projectsRouter.patch(
  "/projects/:id/warranty-expected",
  requireAuth,
  requirePermission((persona) => canManageWarranty(persona)),
  async (req, res) => {
    const id = z.uuid().parse(req.params.id);
    const { expected } = z.object({ expected: z.boolean() }).parse(req.body);
    await setWarrantyExpected(id, expected);
    res.status(204).end();
  },
);

projectsRouter.get(
  "/projects/:id/warranty-history",
  requireAuth,
  requirePermission((persona) => canAccessProject(persona)),
  async (req, res) => {
    const id = z.uuid().parse(req.params.id);
    const entries = await getWarrantyHistory(id);
    res.json({ entries });
  },
);

const activateWarrantySchema = z.object({
  endsAt: z.iso.date(),
  reason: z.string().optional(),
  invoiceReference: z.string().optional(),
});
projectsRouter.post(
  "/projects/:id/warranty",
  requireAuth,
  requirePermission((persona) => canManageWarranty(persona)),
  async (req, res) => {
    const id = z.uuid().parse(req.params.id);
    const body = activateWarrantySchema.parse(req.body);
    const entry = await activateOrUpdateWarranty(id, body, req.employee!.id);
    res.json({ entry });
  },
);

// ---------------------------------------------------------------------------
// Menu Options du projet (Projet 2F, 17 août 2026)
// ---------------------------------------------------------------------------

const updateProjectInfoSchema = z.object({ name: z.string().min(1).optional(), deadline: z.iso.date().nullable().optional() });
projectsRouter.patch(
  "/projects/:id",
  requireAuth,
  requirePermission((persona) => canManageProject(persona)),
  async (req, res) => {
    const id = z.uuid().parse(req.params.id);
    const body = updateProjectInfoSchema.parse(req.body);
    await updateProjectInfo(id, body);
    res.status(204).end();
  },
);

projectsRouter.patch(
  "/projects/:id/archived",
  requireAuth,
  requirePermission((persona) => canArchiveProject(persona)),
  async (req, res) => {
    const id = z.uuid().parse(req.params.id);
    const { archived } = z.object({ archived: z.boolean() }).parse(req.body);
    await setProjectArchived(id, archived);
    res.status(204).end();
  },
);

projectsRouter.delete(
  "/projects/:id",
  requireAuth,
  requirePermission((persona) => canDeleteProject(persona)),
  async (req, res) => {
    const id = z.uuid().parse(req.params.id);
    await deleteProject(id);
    res.status(204).end();
  },
);

projectsRouter.get(
  "/projects/:id/history",
  requireAuth,
  requirePermission((persona) => canAccessProject(persona)),
  async (req, res) => {
    const id = z.uuid().parse(req.params.id);
    const events = await getProjectHistory(id);
    res.json({ events });
  },
);

// ---------------------------------------------------------------------------
// Post-mortem (Projet 2E, 17 août 2026)
// ---------------------------------------------------------------------------

projectsRouter.get(
  "/projects/:id/post-mortem",
  requireAuth,
  requirePermission((persona) => canAccessProject(persona)),
  async (req, res) => {
    const id = z.uuid().parse(req.params.id);
    const postMortem = await getPostMortem(id, req.employee!.persona);
    res.json({ postMortem });
  },
);

const updatePostMortemSchema = z.object({
  depassements: z.string().optional(),
  ameliorations: z.string().optional(),
  recommandation: z.string().optional(),
});
projectsRouter.patch(
  "/projects/:id/post-mortem",
  requireAuth,
  requirePermission((persona) => canManagePostMortem(persona)),
  async (req, res) => {
    const id = z.uuid().parse(req.params.id);
    const body = updatePostMortemSchema.parse(req.body);
    await updatePostMortemAnalysis(id, body);
    res.status(204).end();
  },
);

projectsRouter.get(
  "/projects/:id/approved-hours",
  requireAuth,
  requirePermission((persona) => canAccessProject(persona)),
  async (req, res) => {
    const id = z.uuid().parse(req.params.id);
    const entries = await getApprovedTimeEntries(id, canSeeFinancialValues(req.employee!.persona));
    res.json({ entries });
  },
);

projectsRouter.get(
  "/projects/:id/approved-purchases",
  requireAuth,
  requirePermission((persona) => canAccessProject(persona)),
  async (req, res) => {
    const id = z.uuid().parse(req.params.id);
    const entries = await getApprovedPurchaseEntries(id, canSeeFinancialValues(req.employee!.persona));
    res.json({ entries });
  },
);
