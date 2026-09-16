/**
 * GSC Pilot — Boîte à outils (nouveau module, 16 septembre 2026)
 *
 * FAQ technique collective : Propriétaire/Direction/Administration déposent
 * des chartes de référence (PDF) par catégorie (canManageToolboxLibrary),
 * n'importe qui pose une question en langage naturel (requireAuth seul) et
 * reçoit une réponse citée directement dans ces chartes. L'historique des
 * fils sert de FAQ partagée — n'importe qui peut continuer le fil de
 * n'importe qui, jamais restreint à son auteur d'origine.
 */
import { prisma } from "../../db.js";
import { HttpError } from "../../middleware/errorHandler.js";
import { STORAGE_BUCKETS, buildStoragePath, createSignedDownloadUrl, createSignedUploadTarget, type SignedUploadTarget } from "../../lib/storage.js";
import { uploadDocumentToAnthropic } from "../../lib/ai/documents.js";
import { runCitedCompletion } from "../../lib/ai/citedCompletion.js";
import { plainTextFromContent } from "../../lib/ai/content.js";
import type Anthropic from "@anthropic-ai/sdk";

const BUCKET = STORAGE_BUCKETS.TOOLBOX_CHARTS;

async function resolveEmployeeNames(ids: (string | null | undefined)[]): Promise<Map<string, string>> {
  const uniqueIds = Array.from(new Set(ids.filter((id): id is string => !!id)));
  if (uniqueIds.length === 0) return new Map();
  const rows = await prisma.employee.findMany({ where: { id: { in: uniqueIds } }, select: { id: true, name: true } });
  return new Map(rows.map((row) => [row.id, row.name]));
}

async function loadActiveCategoryOrThrow(categoryId: string) {
  const category = await prisma.toolboxCategory.findUnique({ where: { id: categoryId } });
  if (!category) throw new HttpError(404, "Catégorie introuvable.");
  return category;
}

export interface ToolboxChartDto {
  id: string;
  fileName: string;
  fileSize: number;
  active: boolean;
  uploadedByName: string;
  uploadedAt: string;
}

export async function createToolboxChartUploadUrl(categoryId: string, fileName: string): Promise<SignedUploadTarget> {
  await loadActiveCategoryOrThrow(categoryId);
  const path = buildStoragePath(`toolbox/${categoryId}`, fileName);
  return createSignedUploadTarget(BUCKET, path);
}

export interface ConfirmToolboxChartInput {
  storagePath: string;
  fileName: string;
  fileSize: number;
}

/** Même prudence que confirmSeaoDocumentUpload : pousse vers l'API Files AVANT de créer la ligne — jamais de charte sans anthropicFileId dans le chemin normal. */
export async function confirmToolboxChartUpload(categoryId: string, uploadedById: string, input: ConfirmToolboxChartInput) {
  await loadActiveCategoryOrThrow(categoryId);
  const anthropicFileId = await uploadDocumentToAnthropic(BUCKET, input.storagePath, input.fileName);
  return prisma.toolboxChart.create({
    data: { categoryId, fileName: input.fileName, storagePath: input.storagePath, fileSize: input.fileSize, anthropicFileId, uploadedById },
  });
}

export async function listToolboxCharts(categoryId: string): Promise<ToolboxChartDto[]> {
  const rows = await prisma.toolboxChart.findMany({ where: { categoryId }, orderBy: { uploadedAt: "asc" } });
  const names = await resolveEmployeeNames(rows.map((r) => r.uploadedById));
  return rows.map((row) => ({
    id: row.id,
    fileName: row.fileName,
    fileSize: row.fileSize,
    active: row.active,
    uploadedByName: names.get(row.uploadedById) ?? "—",
    uploadedAt: row.uploadedAt.toISOString(),
  }));
}

export async function getToolboxChartDownloadUrl(chartId: string): Promise<string> {
  const chart = await prisma.toolboxChart.findUnique({ where: { id: chartId } });
  if (!chart) throw new HttpError(404, "Charte introuvable.");
  return createSignedDownloadUrl(BUCKET, chart.storagePath);
}

/** "Retirer" = désactiver, jamais supprimer — même convention que PurchaseCategory/les catalogues Checklist (les fils déjà répondus à partir de cette charte restent valides tels quels). */
export async function retireToolboxChart(chartId: string, active: boolean) {
  const chart = await prisma.toolboxChart.findUnique({ where: { id: chartId } });
  if (!chart) throw new HttpError(404, "Charte introuvable.");
  return prisma.toolboxChart.update({ where: { id: chartId }, data: { active } });
}

export interface ToolboxThreadListItemDto {
  id: string;
  categoryId: string;
  categoryLabel: string;
  startedByName: string;
  startedAt: string;
  lastMessageAt: string;
  firstQuestion: string;
}

/** Fils de discussion, triés par activité récente — la FAQ collective. categoryId optionnel filtre par catégorie (ToolboxPage.tsx, choix de catégorie d'abord). */
export async function listToolboxThreads(categoryId?: string): Promise<ToolboxThreadListItemDto[]> {
  const threads = await prisma.toolboxThread.findMany({
    where: categoryId ? { categoryId } : {},
    include: { category: { select: { label: true } }, messages: { where: { role: "user" }, orderBy: { createdAt: "asc" }, take: 1 } },
    orderBy: { lastMessageAt: "desc" },
  });
  const names = await resolveEmployeeNames(threads.map((t) => t.startedById));
  return threads.map((thread) => ({
    id: thread.id,
    categoryId: thread.categoryId,
    categoryLabel: thread.category.label,
    startedByName: names.get(thread.startedById) ?? "—",
    startedAt: thread.startedAt.toISOString(),
    lastMessageAt: thread.lastMessageAt.toISOString(),
    firstQuestion: plainTextFromContent(thread.messages[0]?.content) || "—",
  }));
}

export interface ToolboxMessageDto {
  id: string;
  role: string;
  authorName: string | null;
  content: unknown;
  createdAt: string;
}
export interface ToolboxThreadDetailDto {
  id: string;
  categoryId: string;
  categoryLabel: string;
  messages: ToolboxMessageDto[];
}

export async function getToolboxThreadDetail(threadId: string): Promise<ToolboxThreadDetailDto> {
  const thread = await prisma.toolboxThread.findUnique({ where: { id: threadId }, include: { category: { select: { label: true } } } });
  if (!thread) throw new HttpError(404, "Fil introuvable.");
  const messages = await prisma.toolboxMessage.findMany({ where: { threadId }, orderBy: { createdAt: "asc" } });
  const names = await resolveEmployeeNames(messages.map((m) => m.authorId));
  return {
    id: thread.id,
    categoryId: thread.categoryId,
    categoryLabel: thread.category.label,
    messages: messages.map((m) => ({
      id: m.id,
      role: m.role,
      authorName: m.authorId ? (names.get(m.authorId) ?? "—") : null,
      content: m.content,
      createdAt: m.createdAt.toISOString(),
    })),
  };
}

async function activeCitedCharts(categoryId: string): Promise<{ anthropicFileId: string; title: string }[]> {
  const charts = await prisma.toolboxChart.findMany({ where: { categoryId, active: true } });
  return charts.map((chart) => ({ anthropicFileId: chart.anthropicFileId!, title: chart.fileName }));
}

const TOOLBOX_SYSTEM_PROMPT =
  "Tu réponds aux questions techniques des employés d'un atelier d'automatisation industrielle, en te basant UNIQUEMENT sur les chartes de référence fournies pour cette catégorie. Cite précisément tes sources. Si l'information n'est pas dans les chartes, dis-le clairement plutôt que d'inventer une réponse.";

/** Nouveau fil — les chartes actives de la catégorie sont posées dans CE premier message seulement (voir citedCompletion.ts). */
export async function startToolboxThread(categoryId: string, startedById: string, message: string) {
  await loadActiveCategoryOrThrow(categoryId);
  const charts = await activeCitedCharts(categoryId);
  if (charts.length === 0) throw new HttpError(400, "Aucune charte active pour cette catégorie.");

  const result = await runCitedCompletion({ documents: charts, history: [], system: TOOLBOX_SYSTEM_PROMPT, userText: message });

  return prisma.$transaction(async (tx) => {
    const thread = await tx.toolboxThread.create({ data: { categoryId, startedById } });
    await tx.toolboxMessage.create({
      data: { threadId: thread.id, role: "user", authorId: startedById, content: result.userContent as unknown as object },
    });
    await tx.toolboxMessage.create({
      data: {
        threadId: thread.id,
        role: "assistant",
        content: result.content as unknown as object,
        inputTokens: result.inputTokens,
        outputTokens: result.outputTokens,
      },
    });
    return thread;
  });
}

/** Continuer un fil existant — n'importe qui, pas seulement l'auteur d'origine (FAQ collective, confirmé). */
export async function continueToolboxThread(threadId: string, authorId: string, message: string) {
  const thread = await prisma.toolboxThread.findUnique({ where: { id: threadId } });
  if (!thread) throw new HttpError(404, "Fil introuvable.");

  const priorMessages = await prisma.toolboxMessage.findMany({ where: { threadId }, orderBy: { createdAt: "asc" } });
  const history: Anthropic.MessageParam[] = priorMessages.map((m) => ({
    role: m.role as "user" | "assistant",
    content: m.content as unknown as Anthropic.MessageParam["content"],
  }));

  const result = await runCitedCompletion({ documents: [], history, system: TOOLBOX_SYSTEM_PROMPT, userText: message });

  return prisma.$transaction(async (tx) => {
    await tx.toolboxMessage.create({ data: { threadId, role: "user", authorId, content: result.userContent as unknown as object } });
    const assistantMessage = await tx.toolboxMessage.create({
      data: {
        threadId,
        role: "assistant",
        content: result.content as unknown as object,
        inputTokens: result.inputTokens,
        outputTokens: result.outputTokens,
      },
    });
    await tx.toolboxThread.update({ where: { id: threadId }, data: { lastMessageAt: new Date() } });
    return assistantMessage;
  });
}
