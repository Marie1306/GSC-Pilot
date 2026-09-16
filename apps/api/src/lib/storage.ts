/**
 * GSC Pilot — Stockage de fichiers (SEAO / Boîte à outils, 16 septembre 2026)
 *
 * Upload direct navigateur → Supabase Storage via URL signée générée ici :
 * les octets ne transitent jamais par Express (voir apps/api/src/app.ts,
 * limite express.json 15mb et le bogue PayloadTooLargeError déjà rencontré
 * une fois sur ce projet). L'autorisation est vérifiée UNE SEULE FOIS, au
 * moment de générer l'URL signée (requireAuth + requirePermission déjà
 * passés dans la route appelante) — le jeton retourné est court-lived et
 * scellé au chemin exact, jamais un accès Storage public (aucune politique
 * RLS Storage n'existe, voir GSC_Pilot_Architecture.md).
 *
 * Deux buckets privés utilisés par ce projet : "seao-documents",
 * "toolbox-charts" — créés manuellement par Marie dans Supabase (cette
 * session n'a aucun accès réseau à Supabase, même contournement que pour
 * toutes les migrations précédentes, voir CLAUDE.md).
 */
import { supabaseAdmin } from "../auth/supabase.js";
import { HttpError } from "../middleware/errorHandler.js";

export const STORAGE_BUCKETS = {
  SEAO_DOCUMENTS: "seao-documents",
  TOOLBOX_CHARTS: "toolbox-charts",
} as const;
export type StorageBucket = (typeof STORAGE_BUCKETS)[keyof typeof STORAGE_BUCKETS];

export interface SignedUploadTarget {
  signedUrl: string;
  token: string;
  path: string;
}

/** Chemin unique — préfixe par entité pour que le rangement du bucket reste lisible, jamais parsé par le code. */
export function buildStoragePath(prefix: string, fileName: string): string {
  const safeName = fileName.trim().replace(/[^a-zA-Z0-9._-]/g, "_") || "fichier";
  return `${prefix}/${crypto.randomUUID()}-${safeName}`;
}

/** Étape 2 du flux d'upload (voir plan) — seul endroit où l'autorisation est vérifiée. */
export async function createSignedUploadTarget(bucket: StorageBucket, path: string): Promise<SignedUploadTarget> {
  const { data, error } = await supabaseAdmin.storage.from(bucket).createSignedUploadUrl(path);
  if (error || !data) throw new HttpError(502, `Impossible de préparer l'upload — ${error?.message ?? "erreur Storage inconnue"}.`);
  return data;
}

/** Visualiser un fichier déjà déposé — jamais d'accès direct par un rôle Storage public. */
export async function createSignedDownloadUrl(bucket: StorageBucket, path: string, expiresInSeconds = 300): Promise<string> {
  const { data, error } = await supabaseAdmin.storage.from(bucket).createSignedUrl(path, expiresInSeconds);
  if (error || !data) throw new HttpError(502, `Impossible de générer le lien de téléchargement — ${error?.message ?? "erreur Storage inconnue"}.`);
  return data.signedUrl;
}

/**
 * Télécharge l'objet déjà déposé — sert aussi de vérification d'intégrité
 * (échoue fort si l'upload direct navigateur→Storage a réellement échoué)
 * avant de pousser le buffer vers l'API Files d'Anthropic (voir lib/ai/documents.ts).
 */
export async function downloadFileBuffer(bucket: StorageBucket, path: string): Promise<Buffer> {
  const { data, error } = await supabaseAdmin.storage.from(bucket).download(path);
  if (error || !data) throw new HttpError(502, `Fichier introuvable dans Storage — ${error?.message ?? "l'upload a peut-être échoué"}.`);
  return Buffer.from(await data.arrayBuffer());
}
