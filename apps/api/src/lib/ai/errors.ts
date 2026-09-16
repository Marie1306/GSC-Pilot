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
  // Le client ne reçoit jamais que le message générique ci-dessous — sans ce
  // log, l'erreur réelle (corps JSON renvoyé par Anthropic pour un
  // APIError, ou l'exception brute pour tout le reste) disparaît
  // complètement, y compris des logs serveur (errorHandler.ts ne logue que
  // les erreurs qui ne sont PAS déjà un HttpError, ce que cette fonction
  // retourne toujours). Bogue réel rencontré le 16 septembre 2026 : première
  // analyse SEAO en production échouée avec le message générique, aucune
  // piste disponible pour diagnostiquer.
  if (err instanceof Anthropic.APIError) {
    console.error(`[ai] Anthropic APIError (status ${err.status ?? "?"}):`, err.error ?? err.message);
  } else {
    console.error("[ai] Erreur inattendue lors d'un appel Anthropic:", err);
  }
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
