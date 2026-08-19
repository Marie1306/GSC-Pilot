import { Router } from "express";
import { z } from "zod";
import { canAccessOverviewViews } from "@gsc-pilot/business-rules";
import { requireAuth, requirePermission } from "../../auth/middleware.js";
import { listContacts, getContactDetail, createContact, updateContact } from "./service.js";

export const contactsRouter = Router();

contactsRouter.get("/contacts", requireAuth, requirePermission((persona) => canAccessOverviewViews(persona)), async (_req, res) => {
  const contacts = await listContacts();
  res.json({ contacts });
});

contactsRouter.get("/contacts/:id", requireAuth, requirePermission((persona) => canAccessOverviewViews(persona)), async (req, res) => {
  const id = z.uuid().parse(req.params.id);
  const contact = await getContactDetail(id);
  res.json({ contact });
});

const contactSchema = z.object({
  type: z.string().min(1),
  name: z.string().min(1),
  company: z.string().nullable().optional(),
  role: z.string().nullable().optional(),
  email: z.union([z.email(), z.literal("")]).nullable().optional(),
  phone: z.string().nullable().optional(),
  categories: z.array(z.string()).optional(),
});
contactsRouter.post("/contacts", requireAuth, requirePermission((persona) => canAccessOverviewViews(persona)), async (req, res) => {
  const body = contactSchema.parse(req.body);
  const contact = await createContact(body);
  res.status(201).json({ contact });
});

const updateSchema = contactSchema.partial();
contactsRouter.patch("/contacts/:id", requireAuth, requirePermission((persona) => canAccessOverviewViews(persona)), async (req, res) => {
  const id = z.uuid().parse(req.params.id);
  const body = updateSchema.parse(req.body);
  const contact = await updateContact(id, body);
  res.json({ contact });
});
