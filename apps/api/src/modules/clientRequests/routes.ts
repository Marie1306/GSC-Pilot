import { Router } from "express";
import { z } from "zod";
import { canCreateClientRequest, canViewClientRequests, canManageClientRequest, canDeleteClientRequest } from "@gsc-pilot/business-rules";
import { requireAuth, requirePermission } from "../../auth/middleware.js";
import { prisma } from "../../db.js";
import {
  createClientRequest,
  listClientRequests,
  getClientRequestDetail,
  addClientRequestNote,
  updateClientRequestStatus,
  transferClientRequestToOwner,
  updateClientRequestFollowUp,
  deleteClientRequest,
  getNextClientRequestDisplayId,
  REQUEST_TYPES,
  URGENCIES,
  SETTABLE_STATUSES,
} from "./service.js";

export const clientRequestsRouter = Router();

/** Aperçu pour la modale « Ajouter rapidement » (23 août 2026) — mêmes rôles que la création. */
clientRequestsRouter.get(
  "/client-requests/next-number",
  requireAuth,
  requirePermission((persona) => canCreateClientRequest(persona)),
  async (_req, res) => {
    const nextDisplayId = await getNextClientRequestDisplayId();
    res.json({ nextDisplayId });
  },
);

/** Pour peupler le menu déroulant du formulaire — mêmes rôles que la création (canViewClientRequests). */
clientRequestsRouter.get(
  "/sales-channels",
  requireAuth,
  requirePermission((persona) => canViewClientRequests(persona)),
  async (_req, res) => {
    const channels = await prisma.salesChannel.findMany({
      where: { active: true },
      select: { id: true, name: true },
      orderBy: { sortOrder: "asc" },
    });
    res.json({ salesChannels: channels });
  },
);

const createSchema = z.object({
  company: z.string().min(1, "L'entreprise est requise."),
  contactName: z.string().min(1, "Le nom du contact est requis."),
  contactRole: z.string().trim().optional(),
  phone: z.string().min(1, "Le téléphone est requis."),
  email: z.email("Courriel invalide."),
  address: z.string().trim().optional(),
  requestType: z.enum(REQUEST_TYPES),
  urgency: z.enum(URGENCIES),
  salesChannelId: z.uuid("Le canal d'entrée est requis."),
  sourceDetail: z.string().trim().optional(),
  nextFollowUp: z.iso.date().optional(),
  summary: z.string().min(1, "Le résumé de la demande est requis."),
});

clientRequestsRouter.post(
  "/client-requests",
  requireAuth,
  requirePermission((persona) => canCreateClientRequest(persona)),
  async (req, res) => {
    const body = createSchema.parse(req.body);
    const row = await createClientRequest(req.employee!.id, {
      ...body,
      nextFollowUp: body.nextFollowUp ? new Date(body.nextFollowUp) : undefined,
    });
    res.status(201).json({ id: row.id, displayId: row.displayId });
  },
);

clientRequestsRouter.get(
  "/client-requests",
  requireAuth,
  requirePermission((persona) => canViewClientRequests(persona)),
  async (_req, res) => {
    const requests = await listClientRequests();
    res.json({ clientRequests: requests });
  },
);

clientRequestsRouter.get(
  "/client-requests/:id",
  requireAuth,
  requirePermission((persona) => canViewClientRequests(persona)),
  async (req, res) => {
    const id = z.uuid().parse(req.params.id);
    const request = await getClientRequestDetail(id);
    res.json({ clientRequest: request });
  },
);

const noteSchema = z.object({ body: z.string().min(1, "La note ne peut pas être vide.") });
clientRequestsRouter.post(
  "/client-requests/:id/notes",
  requireAuth,
  requirePermission((persona) => canManageClientRequest(persona)),
  async (req, res) => {
    const id = z.uuid().parse(req.params.id);
    const { body } = noteSchema.parse(req.body);
    const note = await addClientRequestNote(id, req.employee!.id, body);
    res.status(201).json({ note });
  },
);

const statusSchema = z.object({ status: z.enum(SETTABLE_STATUSES), lostReason: z.string().trim().optional() });
clientRequestsRouter.patch(
  "/client-requests/:id/status",
  requireAuth,
  requirePermission((persona) => canManageClientRequest(persona)),
  async (req, res) => {
    const id = z.uuid().parse(req.params.id);
    const { status, lostReason } = statusSchema.parse(req.body);
    const updated = await updateClientRequestStatus(id, status, lostReason);
    res.json({ id: updated.id, status: updated.status });
  },
);

clientRequestsRouter.post(
  "/client-requests/:id/transfer-to-owner",
  requireAuth,
  requirePermission((persona) => canManageClientRequest(persona)),
  async (req, res) => {
    const id = z.uuid().parse(req.params.id);
    await transferClientRequestToOwner(id);
    res.status(204).end();
  },
);

const followUpSchema = z.object({ nextFollowUp: z.iso.date().nullable() });
clientRequestsRouter.patch(
  "/client-requests/:id/follow-up",
  requireAuth,
  requirePermission((persona) => canManageClientRequest(persona)),
  async (req, res) => {
    const id = z.uuid().parse(req.params.id);
    const { nextFollowUp } = followUpSchema.parse(req.body);
    await updateClientRequestFollowUp(id, nextFollowUp ? new Date(nextFollowUp) : null);
    res.status(204).end();
  },
);

clientRequestsRouter.delete(
  "/client-requests/:id",
  requireAuth,
  requirePermission((persona) => canDeleteClientRequest(persona)),
  async (req, res) => {
    const id = z.uuid().parse(req.params.id);
    await deleteClientRequest(id);
    res.status(204).end();
  },
);
