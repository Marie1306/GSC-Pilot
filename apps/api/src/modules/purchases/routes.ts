import { Router } from "express";
import { z } from "zod";
import { canCreatePurchaseShortlist, canApprovePurchaseRequest, type Persona } from "@gsc-pilot/business-rules";
import { requireAuth, requirePermission } from "../../auth/middleware.js";
import { loadDelegationSettings } from "../../auth/delegation.js";
import { prisma } from "../../db.js";
import { HttpError } from "../../middleware/errorHandler.js";
import {
  createPurchaseShortlist,
  listPurchaseRequests,
  setPurchaseRequestAmount,
  approvePurchaseRequest,
  rejectPurchaseRequest,
} from "./service.js";

export const purchasesRouter = Router();

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

/** Liste rapide d'achats de projet — Propriétaire et Direction seulement (confirmé le 12 août 2026). */
purchasesRouter.post(
  "/purchase-requests/shortlist",
  requireAuth,
  requirePermission((persona) => canCreatePurchaseShortlist(persona)),
  async (req, res) => {
    const body = createShortlistSchema.parse(req.body);
    const created = await createPurchaseShortlist(body.projectId, req.employee!.id, body.lines);
    res.status(201).json({ purchaseRequests: created.map((row) => row.id) });
  },
);

/** Centre d'action des demandes d'achat — chacun voit au moins ses propres demandes (voir canViewPurchase dans roles.ts). */
purchasesRouter.get("/purchase-requests", requireAuth, async (req, res) => {
  const status = typeof req.query.status === "string" ? req.query.status : undefined;
  const employee = req.employee!;
  const list = await listPurchaseRequests({ id: employee.id, persona: employee.persona }, status);
  res.json({ purchaseRequests: list });
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

async function loadRequestOrThrow(id: string) {
  const request = await prisma.purchaseRequest.findUnique({ where: { id }, include: { category: true } });
  if (!request) throw new HttpError(404, "Demande d'achat introuvable.");
  return request;
}

/**
 * Vérification à portée d'enregistrement — charge la demande et sa
 * catégorie (si présente) puis appelle canApprovePurchaseRequest telle
 * quelle (roles.ts), jamais modifiée. Pour une ligne de liste rapide,
 * categoryId est toujours nul → aucun seuil trouvé → jamais de double
 * autorisation, exactement le comportement confirmé.
 */
async function assertCanActOnRequest(
  employee: { id: string; persona: Persona },
  request: { id: string; category: { name: string; thresholdAmount: unknown } | null; amount: unknown },
): Promise<void> {
  const settings = await loadDelegationSettings();
  const thresholds = request.category ? { [request.category.name]: Number(request.category.thresholdAmount) } : {};
  const allowed = canApprovePurchaseRequest(
    settings,
    employee.persona,
    { category: request.category?.name, amount: request.amount ? Number(request.amount) : 0 },
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
