import { Router } from "express";
import { z } from "zod";
import { canManageSeao, canDecideSeaoGoNoGo } from "@gsc-pilot/business-rules";
import { requireAuth, requirePermission } from "../../auth/middleware.js";
import {
  getNextSeaoDisplayId,
  createSeaoFile,
  listSeaoFiles,
  getSeaoFileDetail,
  createSeaoDocumentUploadUrl,
  confirmSeaoDocumentUpload,
  getSeaoDocumentDownloadUrl,
  triggerSeaoAnalysis,
  decideSeaoGoNoGo,
  recordSeaoOutcome,
  convertSeaoFileToProject,
  createSeaoBordereauLine,
  updateSeaoBordereauLine,
  deleteSeaoBordereauLine,
  createSeaoCompetitor,
  deleteSeaoCompetitor,
  addSeaoNote,
} from "./service.js";

export const seaoRouter = Router();

seaoRouter.get("/seao/next-number", requireAuth, requirePermission(canManageSeao), async (_req, res) => {
  res.json(await getNextSeaoDisplayId());
});

seaoRouter.get("/seao", requireAuth, requirePermission(canManageSeao), async (_req, res) => {
  res.json({ seaoFiles: await listSeaoFiles() });
});

seaoRouter.get("/seao/:id", requireAuth, requirePermission(canManageSeao), async (req, res) => {
  const id = z.uuid().parse(req.params.id);
  res.json(await getSeaoFileDetail(id));
});

const newContactSchema = z.object({
  contactName: z.string().min(1, "Le nom du contact est requis."),
  company: z.string().trim().optional(),
  contactRole: z.string().trim().optional(),
  phone: z.string().trim().optional(),
  email: z.string().trim().optional(),
});

seaoRouter.post("/seao", requireAuth, requirePermission(canManageSeao), async (req, res) => {
  const body = z
    .object({
      newContact: newContactSchema,
      referenceNumber: z.string().trim().optional(),
      title: z.string().trim().optional(),
      submissionDeadline: z.iso.date().optional(),
    })
    .parse(req.body);
  const file = await createSeaoFile(req.employee!.id, body);
  res.status(201).json({ id: file.id, displayId: file.displayId });
});

seaoRouter.post("/seao/:id/documents/upload-url", requireAuth, requirePermission(canManageSeao), async (req, res) => {
  const id = z.uuid().parse(req.params.id);
  const { fileName } = z.object({ fileName: z.string().min(1) }).parse(req.body);
  res.json(await createSeaoDocumentUploadUrl(id, fileName));
});

seaoRouter.post("/seao/:id/documents", requireAuth, requirePermission(canManageSeao), async (req, res) => {
  const id = z.uuid().parse(req.params.id);
  const body = z.object({ storagePath: z.string().min(1), fileName: z.string().min(1), fileSize: z.number().int().positive() }).parse(req.body);
  const document = await confirmSeaoDocumentUpload(id, req.employee!.id, body);
  res.status(201).json({ id: document.id });
});

seaoRouter.get("/seao/documents/:documentId/download-url", requireAuth, requirePermission(canManageSeao), async (req, res) => {
  const documentId = z.uuid().parse(req.params.documentId);
  res.json({ url: await getSeaoDocumentDownloadUrl(documentId) });
});

seaoRouter.post("/seao/:id/analyze", requireAuth, requirePermission(canManageSeao), async (req, res) => {
  const id = z.uuid().parse(req.params.id);
  const analysis = await triggerSeaoAnalysis(id, req.employee!.id);
  res.status(201).json({ id: analysis.id, version: analysis.version });
});

seaoRouter.post("/seao/:id/go-no-go", requireAuth, requirePermission(canDecideSeaoGoNoGo), async (req, res) => {
  const id = z.uuid().parse(req.params.id);
  const { go, nonSubmissionReason } = z.object({ go: z.boolean(), nonSubmissionReason: z.string().trim().optional() }).parse(req.body);
  await decideSeaoGoNoGo(id, req.employee!.id, go, nonSubmissionReason);
  res.status(204).end();
});

seaoRouter.post("/seao/:id/outcome", requireAuth, requirePermission(canDecideSeaoGoNoGo), async (req, res) => {
  const id = z.uuid().parse(req.params.id);
  const { won } = z.object({ won: z.boolean() }).parse(req.body);
  await recordSeaoOutcome(id, req.employee!.id, won);
  res.status(204).end();
});

seaoRouter.post("/seao/:id/convert-to-project", requireAuth, requirePermission(canDecideSeaoGoNoGo), async (req, res) => {
  const id = z.uuid().parse(req.params.id);
  const body = z.object({ name: z.string().min(1, "Le nom du projet est requis."), projectNumber: z.string().trim().optional() }).parse(req.body);
  const project = await convertSeaoFileToProject(id, req.employee!.id, body);
  res.status(201).json({ projectId: project.id, projectNumber: project.projectNumber });
});

const bordereauLineSchema = z.object({
  description: z.string().min(1, "La description est requise."),
  cost: z.number().nonnegative(),
  marginPct: z.number().min(0).max(99.99),
});

seaoRouter.post("/seao/:id/bordereau-lines", requireAuth, requirePermission(canManageSeao), async (req, res) => {
  const id = z.uuid().parse(req.params.id);
  const body = bordereauLineSchema.parse(req.body);
  const line = await createSeaoBordereauLine(id, body);
  res.status(201).json({ id: line.id });
});

seaoRouter.patch("/seao/bordereau-lines/:lineId", requireAuth, requirePermission(canManageSeao), async (req, res) => {
  const lineId = z.uuid().parse(req.params.lineId);
  const body = bordereauLineSchema.partial().parse(req.body);
  await updateSeaoBordereauLine(lineId, body);
  res.status(204).end();
});

seaoRouter.delete("/seao/bordereau-lines/:lineId", requireAuth, requirePermission(canManageSeao), async (req, res) => {
  const lineId = z.uuid().parse(req.params.lineId);
  await deleteSeaoBordereauLine(lineId);
  res.status(204).end();
});

seaoRouter.post("/seao/:id/competitors", requireAuth, requirePermission(canManageSeao), async (req, res) => {
  const id = z.uuid().parse(req.params.id);
  const { companyName, submittedPrice } = z.object({ companyName: z.string().min(1), submittedPrice: z.number().nonnegative() }).parse(req.body);
  const competitor = await createSeaoCompetitor(id, req.employee!.id, companyName, submittedPrice);
  res.status(201).json({ id: competitor.id });
});

seaoRouter.delete("/seao/competitors/:competitorId", requireAuth, requirePermission(canManageSeao), async (req, res) => {
  const competitorId = z.uuid().parse(req.params.competitorId);
  await deleteSeaoCompetitor(competitorId);
  res.status(204).end();
});

seaoRouter.post("/seao/:id/notes", requireAuth, requirePermission(canManageSeao), async (req, res) => {
  const id = z.uuid().parse(req.params.id);
  const { body: noteBody } = z.object({ body: z.string().min(1) }).parse(req.body);
  const note = await addSeaoNote(id, req.employee!.id, noteBody);
  res.status(201).json({ id: note.id });
});
