import { Router } from "express";
import { z } from "zod";
import {
  canSubmitPurchaseRequest,
  canApprovePurchaseRequest,
  canManagePurchaseFulfillment,
  buildFrozenPurchaseThresholdsMap,
  type Persona,
} from "@gsc-pilot/business-rules";
import { requireAuth, requirePermission, requirePermissionWithDelegation } from "../../auth/middleware.js";
import { loadDelegationSettings } from "../../auth/delegation.js";
import { prisma } from "../../db.js";
import { HttpError } from "../../middleware/errorHandler.js";
import { listPurchaseCategories } from "../settings/purchaseCategories.js";
import {
  createPurchaseShortlist,
  createPurchaseRequest,
  listPurchaseRequests,
  updatePurchaseRequest,
  setPurchaseRequestAmount,
  approvePurchaseRequest,
  rejectPurchaseRequest,
  setFulfillmentStatus,
  applyPurchaseRequestToProject,
  FULFILLMENT_STATUSES,
  type FulfillmentStatus,
} from "./service.js";

export const purchasesRouter = Router();

/** Catégories actives seulement — pour choisir dans le formulaire, pas pour les gérer (voir /api/settings/purchase-categories, Direction seulement). Ouvert à tous : tout le monde soumet désormais une demande d'achat. */
purchasesRouter.get("/purchase-requests/categories", requireAuth, async (_req, res) => {
  const categories = (await listPurchaseCategories()).filter((category) => category.active);
  res.json({ categories });
});

const shortlistLineSchema = z.object({
  description: z.string().min(1, "La description est requise."),
  supplier: z.string().trim().optional(),
  estimatedAmountMin: z.number().nonnegative().optional(),
  estimatedAmountMax: z.number().nonnegative().optional(),
});
const createShortlistSchema = z.object({
  projectId: z.uuid(),
  lines: z.array(shortlistLineSchema).min(1, "Au moins une ligne est requise."),
});

/** Liste rapide d'achats de projet — ouverte à tous les rôles depuis le 13 août 2026 (voir canSubmitPurchaseRequest, roles.ts). */
purchasesRouter.post(
  "/purchase-requests/shortlist",
  requireAuth,
  requirePermission((persona) => canSubmitPurchaseRequest(persona)),
  async (req, res) => {
    const body = createShortlistSchema.parse(req.body);
    const created = await createPurchaseShortlist(body.projectId, req.employee!.id, body.lines);
    res.status(201).json({ purchaseRequests: created.map((row) => row.id) });
  },
);

const createRequestSchema = z.object({
  projectType: z.enum(["project", "internal"]),
  projectId: z.uuid().optional(),
  categoryId: z.uuid(),
  description: z.string().min(1, "La description est requise."),
  supplier: z.string().trim().optional(),
  estimatedAmountMin: z.number().nonnegative().optional(),
  estimatedAmountMax: z.number().nonnegative().optional(),
});

/** Formulaire général de demande d'achat (avec catégorie) — ouvert à tous depuis le 13 août 2026. */
purchasesRouter.post(
  "/purchase-requests",
  requireAuth,
  requirePermission((persona) => canSubmitPurchaseRequest(persona)),
  async (req, res) => {
    const body = createRequestSchema.parse(req.body);
    const created = await createPurchaseRequest(req.employee!.id, body);
    res.status(201).json({ id: created.id, displayId: created.displayId });
  },
);

/** Centre d'action des demandes d'achat — chacun voit au moins ses propres demandes (voir canViewPurchase dans roles.ts). Sans ?status, retourne tout ce qui est visible (pas seulement en attente) — voir listPurchaseRequests. */
purchasesRouter.get("/purchase-requests", requireAuth, async (req, res) => {
  const status = typeof req.query.status === "string" ? req.query.status : undefined;
  const employee = req.employee!;
  const list = await listPurchaseRequests({ id: employee.id, persona: employee.persona }, status);
  res.json({ purchaseRequests: list });
});

const updateRequestSchema = z.object({
  description: z.string().min(1).optional(),
  supplier: z.string().trim().nullable().optional(),
  estimatedAmountMin: z.number().nonnegative().nullable().optional(),
  estimatedAmountMax: z.number().nonnegative().nullable().optional(),
});

/** Le demandeur modifie sa PROPRE demande, tant qu'elle reste en attente (updatePurchaseRequest vérifie la propriété + le statut). */
purchasesRouter.patch("/purchase-requests/:id", requireAuth, async (req, res) => {
  const id = z.uuid().parse(req.params.id);
  const body = updateRequestSchema.parse(req.body);
  const updated = await updatePurchaseRequest(id, req.employee!.id, body);
  res.json({ id: updated.id });
});

/** Fixer/ajuster le prix avant approbation — même porte que l'approbation elle-même (roles.ts, canApprovePurchaseRequest). */
purchasesRouter.patch("/purchase-requests/:id/amount", requireAuth, async (req, res) => {
  const employee = req.employee!;
  const { amount } = z.object({ amount: z.number().positive() }).parse(req.body);
  const id = z.uuid().parse(req.params.id);

  const request = await loadRequestOrThrow(id);
  await assertCanActOnRequest(employee, request);

  const updated = await setPurchaseRequestAmount(id, amount);
  res.json({ id: updated.id, amount: updated.amount ? Number(updated.amount) : null });
});

purchasesRouter.post("/purchase-requests/:id/approve", requireAuth, async (req, res) => {
  const employee = req.employee!;
  const id = z.uuid().parse(req.params.id);

  const request = await loadRequestOrThrow(id);
  await assertCanActOnRequest(employee, request);

  const updated = await approvePurchaseRequest(id, employee.id);
  res.json({ id: updated.id, status: updated.status });
});

purchasesRouter.post("/purchase-requests/:id/reject", requireAuth, async (req, res) => {
  const employee = req.employee!;
  const id = z.uuid().parse(req.params.id);
  const { reason } = z.object({ reason: z.string().optional() }).parse(req.body ?? {});

  const request = await loadRequestOrThrow(id);
  await assertCanActOnRequest(employee, request);

  const updated = await rejectPurchaseRequest(id, reason);
  res.json({ id: updated.id, status: updated.status });
});

const fulfillmentSchema = z.object({ status: z.enum(FULFILLMENT_STATUSES) });

/** Direction fait progresser le suivi de commande (en attente/commandé/reçu) — confirmé le 13 août 2026. */
purchasesRouter.patch(
  "/purchase-requests/:id/fulfillment",
  requireAuth,
  requirePermissionWithDelegation((settings, persona) => canManagePurchaseFulfillment(settings, persona)),
  async (req, res) => {
    const id = z.uuid().parse(req.params.id);
    const { status } = fulfillmentSchema.parse(req.body);
    const updated = await setFulfillmentStatus(id, status as FulfillmentStatus);
    res.json({ id: updated.id, fulfillmentStatus: updated.fulfillmentStatus });
  },
);

/** Applique l'achat autorisé et reçu au projet — geste explicite distinct de l'autorisation (confirmé le 13 août 2026). */
purchasesRouter.post(
  "/purchase-requests/:id/apply-to-project",
  requireAuth,
  requirePermissionWithDelegation((settings, persona) => canManagePurchaseFulfillment(settings, persona)),
  async (req, res) => {
    const id = z.uuid().parse(req.params.id);
    const updated = await applyPurchaseRequestToProject(id);
    res.json({ id: updated.id, appliedToProjectAt: updated.appliedToProjectAt?.toISOString() ?? null });
  },
);

async function loadRequestOrThrow(id: string) {
  const request = await prisma.purchaseRequest.findUnique({ where: { id }, include: { category: true, requester: { select: { persona: true } } } });
  if (!request) throw new HttpError(404, "Demande d'achat introuvable.");
  return request;
}

/**
 * Vérification à portée d'enregistrement — charge la demande, sa catégorie
 * (si présente) et le rôle de son demandeur, puis appelle
 * canApprovePurchaseRequest telle quelle (roles.ts). Pour une ligne de
 * liste rapide, categoryId est toujours nul → aucun seuil trouvé → jamais
 * de double autorisation, comportement confirmé et inchangé.
 *
 * requesterPersona (ajouté le 13 août 2026) : une demande soumise par
 * Administration/Propriétaire/Direction n'entraîne plus jamais de double
 * autorisation, peu importe le montant — voir roles.ts.
 *
 * Le seuil utilisé ici est CELUI GELÉ SUR LA DEMANDE (thresholdAmountAtSubmission),
 * jamais relu en direct depuis PurchaseCategory — confirmé le 12 août 2026 :
 * un changement de seuil par Direction ne s'applique jamais rétroactivement
 * à une demande déjà en attente.
 */
async function assertCanActOnRequest(
  employee: { id: string; persona: Persona },
  request: {
    id: string;
    category: { name: string } | null;
    thresholdAmountAtSubmission: unknown;
    amount: unknown;
    requester: { persona: Persona };
  },
): Promise<void> {
  const settings = await loadDelegationSettings();
  const thresholds = buildFrozenPurchaseThresholdsMap({
    category: request.category?.name ?? null,
    thresholdAmountAtSubmission:
      request.thresholdAmountAtSubmission === null || request.thresholdAmountAtSubmission === undefined
        ? null
        : Number(request.thresholdAmountAtSubmission),
  });
  const allowed = canApprovePurchaseRequest(
    settings,
    employee.persona,
    { category: request.category?.name, amount: request.amount ? Number(request.amount) : 0, requesterPersona: request.requester.persona },
    thresholds,
  );
  if (!allowed) {
    await prisma.auditLogEntry.create({
      data: {
        actorId: employee.id,
        actorPersona: employee.persona,
        action: "permission_denied",
        entityType: "purchase_request",
        entityId: request.id,
        meta: { reason: "canApprovePurchaseRequest" },
      },
    });
    throw new HttpError(403, "forbidden");
  }
}
