import { supabase } from "./supabaseClient.js";
import { apiFetch } from "./apiClient.js";

interface SignedUploadTarget {
  signedUrl: string;
  token: string;
  path: string;
}

/**
 * Flux d'upload à 3 requêtes (SEAO / Boîte à outils, 16 septembre 2026) —
 * les octets du fichier vont directement du navigateur à Supabase Storage,
 * jamais par l'API Express (voir apps/api/src/lib/storage.ts, en-tête) :
 * (1) l'API vérifie la permission et génère une URL signée pour CE chemin
 * précis, (2) le navigateur y envoie le fichier directement, (3) l'API
 * confirme (télécharge, crée la ligne Prisma, pousse vers l'IA).
 */
export async function uploadFileViaSignedUrl<T>(bucket: string, uploadUrlEndpoint: string, confirmEndpoint: string, file: File): Promise<T> {
  const { path, token } = await apiFetch<SignedUploadTarget>(uploadUrlEndpoint, {
    method: "POST",
    body: JSON.stringify({ fileName: file.name }),
  });

  const { error } = await supabase.storage.from(bucket).uploadToSignedUrl(path, token, file);
  if (error) throw new Error(`Échec de l'envoi du fichier — ${error.message}`);

  return apiFetch<T>(confirmEndpoint, {
    method: "POST",
    body: JSON.stringify({ storagePath: path, fileName: file.name, fileSize: file.size }),
  });
}
