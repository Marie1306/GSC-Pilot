import { Router } from "express";
import { z } from "zod";
import { canManageToolboxLibrary } from "@gsc-pilot/business-rules";
import { requireAuth, requirePermission } from "../../auth/middleware.js";
import { listToolboxCategories, createToolboxCategory, updateToolboxCategory } from "../settings/toolboxCategories.js";
import {
  createToolboxChartUploadUrl,
  confirmToolboxChartUpload,
  listToolboxCharts,
  getToolboxChartDownloadUrl,
  retireToolboxChart,
  listToolboxThreads,
  getToolboxThreadDetail,
  startToolboxThread,
  continueToolboxThread,
} from "./service.js";

export const toolboxRouter = Router();

// Catégories — visibles à tous (choix de catégorie avant de poser une question), gestion réservée au trio.
toolboxRouter.get("/toolbox/categories", requireAuth, async (_req, res) => {
  res.json({ categories: await listToolboxCategories() });
});
toolboxRouter.post("/toolbox/categories", requireAuth, requirePermission(canManageToolboxLibrary), async (req, res) => {
  const { label, insertBeforeId } = z.object({ label: z.string().min(1), insertBeforeId: z.uuid().optional() }).parse(req.body);
  res.status(201).json(await createToolboxCategory(label, insertBeforeId));
});
toolboxRouter.patch("/toolbox/categories/:id", requireAuth, requirePermission(canManageToolboxLibrary), async (req, res) => {
  const id = z.uuid().parse(req.params.id);
  const body = z.object({ label: z.string().min(1).optional(), active: z.boolean().optional() }).parse(req.body);
  res.json(await updateToolboxCategory(id, body));
});

// Chartes — liste visible à tous (transparence sur ce que l'IA connaît), dépôt/retrait réservés au trio.
toolboxRouter.get("/toolbox/categories/:id/charts", requireAuth, async (req, res) => {
  const categoryId = z.uuid().parse(req.params.id);
  res.json({ charts: await listToolboxCharts(categoryId) });
});
toolboxRouter.post("/toolbox/categories/:id/charts/upload-url", requireAuth, requirePermission(canManageToolboxLibrary), async (req, res) => {
  const categoryId = z.uuid().parse(req.params.id);
  const { fileName } = z.object({ fileName: z.string().min(1) }).parse(req.body);
  res.json(await createToolboxChartUploadUrl(categoryId, fileName));
});
toolboxRouter.post("/toolbox/categories/:id/charts", requireAuth, requirePermission(canManageToolboxLibrary), async (req, res) => {
  const categoryId = z.uuid().parse(req.params.id);
  const body = z.object({ storagePath: z.string().min(1), fileName: z.string().min(1), fileSize: z.number().int().positive() }).parse(req.body);
  const chart = await confirmToolboxChartUpload(categoryId, req.employee!.id, body);
  res.status(201).json({ id: chart.id });
});
toolboxRouter.get("/toolbox/charts/:chartId/download-url", requireAuth, async (req, res) => {
  const chartId = z.uuid().parse(req.params.chartId);
  res.json({ url: await getToolboxChartDownloadUrl(chartId) });
});
toolboxRouter.patch("/toolbox/charts/:chartId", requireAuth, requirePermission(canManageToolboxLibrary), async (req, res) => {
  const chartId = z.uuid().parse(req.params.chartId);
  const { active } = z.object({ active: z.boolean() }).parse(req.body);
  await retireToolboxChart(chartId, active);
  res.status(204).end();
});

// Fils de discussion — ouverts à tous (poser une question ET continuer le fil de n'importe qui, FAQ collective).
toolboxRouter.get("/toolbox/threads", requireAuth, async (req, res) => {
  const { categoryId } = z.object({ categoryId: z.uuid().optional() }).parse(req.query);
  res.json({ threads: await listToolboxThreads(categoryId) });
});
toolboxRouter.get("/toolbox/threads/:id", requireAuth, async (req, res) => {
  const id = z.uuid().parse(req.params.id);
  res.json(await getToolboxThreadDetail(id));
});
toolboxRouter.post("/toolbox/threads", requireAuth, async (req, res) => {
  const { categoryId, message } = z.object({ categoryId: z.uuid(), message: z.string().min(1) }).parse(req.body);
  const thread = await startToolboxThread(categoryId, req.employee!.id, message);
  res.status(201).json({ id: thread.id });
});
toolboxRouter.post("/toolbox/threads/:id/messages", requireAuth, async (req, res) => {
  const id = z.uuid().parse(req.params.id);
  const { message } = z.object({ message: z.string().min(1) }).parse(req.body);
  const assistantMessage = await continueToolboxThread(id, req.employee!.id, message);
  res.status(201).json({ id: assistantMessage.id });
});
