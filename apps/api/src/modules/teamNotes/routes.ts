import { Router } from "express";
import { z } from "zod";
import { ROLES } from "@gsc-pilot/business-rules";
import { requireAuth } from "../../auth/middleware.js";
import { listRecipientOptions, sendTeamNote, getInbox, getAllArchived, markTeamNoteRead } from "./service.js";

// Monté sur /api directement (voir app.ts) — même patron que rollings/reports.
// Aucune permission dédiée (requireAuth seulement) : accessible à tous les
// rôles, voir schema.prisma (en-tête du modèle TeamNote) et roles.ts
// (canAccessActionCenter, qui gouverne seulement l'accès à la PAGE Centre
// d'actions, pas ces routes).
export const teamNotesRouter = Router();

const PERSONA_VALUES = [ROLES.OWNER, ROLES.ADMIN, ROLES.BOSS, ROLES.MEMBER, ROLES.WAREHOUSE] as const;

teamNotesRouter.get("/team-notes/recipients", requireAuth, async (req, res) => {
  res.json({ employees: await listRecipientOptions(req.employee!.id) });
});

const sendSchema = z.object({
  recipientId: z.uuid().optional(),
  recipientPersona: z.enum(PERSONA_VALUES).optional(),
  body: z.string().min(1),
});
teamNotesRouter.post("/team-notes", requireAuth, async (req, res) => {
  const input = sendSchema.parse(req.body);
  res.status(201).json(await sendTeamNote(req.employee!.id, input));
});

teamNotesRouter.get("/team-notes/inbox", requireAuth, async (req, res) => {
  res.json(await getInbox(req.employee!.id));
});

teamNotesRouter.get("/team-notes/archive", requireAuth, async (req, res) => {
  res.json({ notes: await getAllArchived(req.employee!.id) });
});

teamNotesRouter.post("/team-notes/:id/read", requireAuth, async (req, res) => {
  const id = z.uuid().parse(req.params.id);
  await markTeamNoteRead(req.employee!.id, id);
  res.status(204).end();
});
