/**
 * GSC Pilot — Documents téléversés sur un projet (section « Documents »,
 * 16 novembre 2026) — même patron que seao/service.ts
 * (createSeaoDocumentUploadUrl/confirmSeaoDocumentUpload/
 * getSeaoDocumentDownloadUrl) MOINS l'appel à l'API Files d'Anthropic :
 * aucune analyse IA n'est demandée ici, jamais ajoutée sans raison.
 *
 * Distinct des documents déjà GÉNÉRÉS par l'appli (Soumission/Confirmation
 * de commande/Facture/Post-mortem/Budgétaire) — ceux-là restent de simples
 * liens vers leurs vues d'export existantes (voir ProjectDocuments.tsx,
 * frontend), jamais dupliqués ici.
 */
import { prisma } from "../../db.js";
import { HttpError } from "../../middleware/errorHandler.js";
import {
  createSignedUploadTarget,
  createSignedDownloadUrl,
  buildStoragePath,
  STORAGE_BUCKETS,
  type SignedUploadTarget,
} from "../../lib/storage.js";

const BUCKET = STORAGE_BUCKETS.PROJECT_DOCUMENTS;

async function loadProjectOrThrow(projectId: string): Promise<void> {
  const project = await prisma.project.findUnique({ where: { id: projectId }, select: { id: true } });
  if (!project) throw new HttpError(404, "Projet introuvable.");
}

export async function createProjectDocumentUploadUrl(projectId: string, fileName: string): Promise<SignedUploadTarget> {
  await loadProjectOrThrow(projectId);
  const path = buildStoragePath(`project/${projectId}`, fileName);
  return createSignedUploadTarget(BUCKET, path);
}

export interface ConfirmProjectDocumentInput {
  storagePath: string;
  fileName: string;
  fileSize: number;
}

export async function confirmProjectDocumentUpload(projectId: string, uploadedById: string, input: ConfirmProjectDocumentInput) {
  await loadProjectOrThrow(projectId);
  return prisma.projectDocument.create({
    data: {
      projectId,
      fileName: input.fileName,
      storagePath: input.storagePath,
      fileSize: input.fileSize,
      uploadedById,
    },
  });
}

export interface ProjectDocumentDto {
  id: string;
  fileName: string;
  fileSize: number;
  uploadedByName: string;
  uploadedAt: string;
}

export async function listProjectDocuments(projectId: string): Promise<ProjectDocumentDto[]> {
  const rows = await prisma.projectDocument.findMany({ where: { projectId }, orderBy: { uploadedAt: "desc" } });
  if (rows.length === 0) return [];
  const uploaders = await prisma.employee.findMany({ where: { id: { in: [...new Set(rows.map((r) => r.uploadedById))] } }, select: { id: true, name: true } });
  const nameById = new Map(uploaders.map((u) => [u.id, u.name]));
  return rows.map((row) => ({
    id: row.id,
    fileName: row.fileName,
    fileSize: row.fileSize,
    uploadedByName: nameById.get(row.uploadedById) ?? "?",
    uploadedAt: row.uploadedAt.toISOString(),
  }));
}

export async function getProjectDocumentDownloadUrl(documentId: string): Promise<string> {
  const document = await prisma.projectDocument.findUnique({ where: { id: documentId } });
  if (!document) throw new HttpError(404, "Document introuvable.");
  return createSignedDownloadUrl(BUCKET, document.storagePath);
}
