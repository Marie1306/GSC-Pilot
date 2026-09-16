import Anthropic from "@anthropic-ai/sdk";
import { HttpError } from "../../middleware/errorHandler.js";

/**
 * Traduit les exceptions typées du SDK Anthropic en HttpError — même
 * principe que errorHandler.ts : jamais de message interne (clé API,
 * détails de la requête) exposé au client. À utiliser dans un catch autour
 * de tout appel à `anthropic.*` (voir citedCompletion.ts, structuredExtraction.ts,
 * documents.ts).
 */
export function toHttpError(err: unknown): HttpError {
  if (err instanceof Anthropic.AuthenticationError) {
    return new HttpError(500, "Clé API Anthropic invalide ou manquante — vérifier ANTHROPIC_API_KEY.");
  }
  if (err instanceof Anthropic.RateLimitError) {
    return new HttpError(429, "Trop de demandes à l'IA en ce moment — réessayer dans quelques instants.");
  }
  if (err instanceof Anthropic.BadRequestError) {
    return new HttpError(502, "La demande envoyée à l'IA a été refusée — documents ou question invalides.");
  }
  if (err instanceof Anthropic.APIConnectionError) {
    return new HttpError(502, "Impossible de joindre le service d'IA — réessayer.");
  }
  if (err instanceof Anthropic.APIError) {
    return new HttpError(502, "Le service d'IA a retourné une erreur — réessayer.");
  }
  return new HttpError(500, "Erreur inattendue du service d'IA.");
}
