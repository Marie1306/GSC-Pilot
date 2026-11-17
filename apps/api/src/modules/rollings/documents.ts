/**
 * GSC Pilot — Documents téléversés sur un roulement (section « Documents »,
 * 17 novembre 2026) — mirror exact de projects/documents.ts, même bucket
 * Storage partagé "project-documents" (préfixe "rolling/" plutôt que
 * "project/", voir lib/storage.ts) : aucun nouveau bucket à créer.
 *
 * Distinct des documents déjà GÉNÉRÉS par l'appli (Budgétaire/Soumission/
 * Confirmation de commande/Factures envoyées/Post-mortem) — ceux-là restent
 * de simples liens vers leurs vues d'export existantes (voir
 * RollingDocuments.tsx, frontend), jamais dupliqués ici.
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

async function loadRollingOrThrow(rollingId: string): Promise<void> {
  const rolling = await prisma.rolling.findUnique({ where: { id: rollingId }, select: { id: true } });
  if (!rolling) throw new HttpError(404, "Roulement introuvable.");
}

export async function createRollingDocumentUploadUrl(rollingId: string, fileName: string): Promise<SignedUploadTarget> {
  await loadRollingOrThrow(rollingId);
  const path = buildStoragePath(`rolling/${rollingId}`, fileName);
  return createSignedUploadTarget(BUCKET, path);
}

export interface ConfirmRollingDocumentInput {
  storagePath: string;
  fileName: string;
  fileSize: number;
}

export async function confirmRollingDocumentUpload(rollingId: string, uploadedById: string, input: ConfirmRollingDocumentInput) {
  await loadRollingOrThrow(rollingId);
  return prisma.rollingDocument.create({
    data: {
      rollingId,
      fileName: input.fileName,
      storagePath: input.storagePath,
      fileSize: input.fileSize,
      uploadedById,
    },
  });
}

export interface RollingDocumentDto {
  id: string;
  fileName: string;
  fileSize: number;
  uploadedByName: string;
  uploadedAt: string;
}

export async function listRollingDocuments(rollingId: string): Promise<RollingDocumentDto[]> {
  const rows = await prisma.rollingDocument.findMany({ where: { rollingId }, orderBy: { uploadedAt: "desc" } });
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

export async function getRollingDocumentDownloadUrl(documentId: string): Promise<string> {
  const document = await prisma.rollingDocument.findUnique({ where: { id: documentId } });
  if (!document) throw new HttpError(404, "Document introuvable.");
  return createSignedDownloadUrl(BUCKET, document.storagePath);
}
