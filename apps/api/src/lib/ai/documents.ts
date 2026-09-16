import Anthropic, { toFile } from "@anthropic-ai/sdk";
import { anthropic } from "./client.js";
import { toHttpError } from "./errors.js";
import { downloadFileBuffer, type StorageBucket } from "../storage.js";

/**
 * Pont Storage → API Files d'Anthropic. Chaque document n'est envoyé qu'une
 * seule fois, juste après confirmation de l'upload Storage (voir
 * seao/service.ts confirmSeaoDocumentUpload / toolbox/service.ts
 * confirmToolboxChartUpload) — anthropicFileId est ensuite réutilisé pour
 * toute analyse/question suivante, jamais ré-uploadé.
 *
 * Volontairement SANS expires_in_seconds : un fichier uploadé sans cette
 * option n'expire jamais (confirmé dans le SDK, FileMetadata.expires_at
 * reste nul) — nécessaire ici puisqu'un dossier SEAO ou une charte de
 * référence doit rester consultable des mois plus tard, pas seulement le
 * temps d'une session.
 */
export async function uploadDocumentToAnthropic(bucket: StorageBucket, storagePath: string, fileName: string): Promise<string> {
  const buffer = await downloadFileBuffer(bucket, storagePath);
  try {
    const uploaded = await anthropic.files.upload({ file: await toFile(buffer, fileName, { type: "application/pdf" }) });
    return uploaded.id;
  } catch (err) {
    throw toHttpError(err);
  }
}

/**
 * Blocs `document` cités — à placer UNIQUEMENT dans le tout premier message
 * d'un appel/fil (voir citedCompletion.ts), jamais répétés à chaque tour.
 * `cache_control` posé sur le dernier bloc seulement : marque la fin du
 * préfixe stable (documents), pour que Claude mette en cache tout ce qui
 * précède un futur tour de conversation (Boîte à outils) ou une future
 * ré-analyse (SEAO, mêmes documents + un nouveau reçu).
 */
export function buildCitedDocumentBlocks(docs: { anthropicFileId: string; title: string }[]): Anthropic.DocumentBlockParam[] {
  return docs.map((doc, index) => ({
    type: "document",
    source: { type: "file", file_id: doc.anthropicFileId },
    title: doc.title,
    citations: { enabled: true },
    ...(index === docs.length - 1 ? { cache_control: { type: "ephemeral" as const } } : {}),
  }));
}
