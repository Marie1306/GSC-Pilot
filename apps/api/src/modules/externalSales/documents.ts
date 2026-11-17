/**
 * GSC Pilot — Documents téléversés sur une vente externe (section
 * « Documents », 17 novembre 2026) — mirror exact de projects/documents.ts,
 * même bucket Storage partagé "project-documents" (préfixe
 * "external-sale/" plutôt que "project/", voir lib/storage.ts) : aucun
 * nouveau bucket à créer.
 *
 * Distinct de la Facture envoyée (lien direct vers sa vue d'export
 * existante, voir ExternalSaleDocuments.tsx, frontend — jamais dupliquée
 * ici). Une vente externe n'a jamais de budgétaire/Soumission/post-mortem
 * (contrairement à Projet/Roulement), donc ce module ne sert que les
 * documents ajoutés à la main.
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

async function loadExternalSaleOrThrow(externalSaleId: string): Promise<void> {
  const sale = await prisma.externalSale.findUnique({ where: { id: externalSaleId }, select: { id: true } });
  if (!sale) throw new HttpError(404, "Vente externe introuvable.");
}

export async function createExternalSaleDocumentUploadUrl(externalSaleId: string, fileName: string): Promise<SignedUploadTarget> {
  await loadExternalSaleOrThrow(externalSaleId);
  const path = buildStoragePath(`external-sale/${externalSaleId}`, fileName);
  return createSignedUploadTarget(BUCKET, path);
}

export interface ConfirmExternalSaleDocumentInput {
  storagePath: string;
  fileName: string;
  fileSize: number;
}

export async function confirmExternalSaleDocumentUpload(externalSaleId: string, uploadedById: string, input: ConfirmExternalSaleDocumentInput) {
  await loadExternalSaleOrThrow(externalSaleId);
  return prisma.externalSaleDocument.create({
    data: {
      externalSaleId,
      fileName: input.fileName,
      storagePath: input.storagePath,
      fileSize: input.fileSize,
      uploadedById,
    },
  });
}

export interface ExternalSaleDocumentDto {
  id: string;
  fileName: string;
  fileSize: number;
  uploadedByName: string;
  uploadedAt: string;
}

export async function listExternalSaleDocuments(externalSaleId: string): Promise<ExternalSaleDocumentDto[]> {
  const rows = await prisma.externalSaleDocument.findMany({ where: { externalSaleId }, orderBy: { uploadedAt: "desc" } });
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

export async function getExternalSaleDocumentDownloadUrl(documentId: string): Promise<string> {
  const document = await prisma.externalSaleDocument.findUnique({ where: { id: documentId } });
  if (!document) throw new HttpError(404, "Document introuvable.");
  return createSignedDownloadUrl(BUCKET, document.storagePath);
}
