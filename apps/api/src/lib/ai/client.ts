import Anthropic from "@anthropic-ai/sdk";
import { env } from "../../env.js";
import { HttpError } from "../../middleware/errorHandler.js";

/**
 * Client Anthropic partagé (SEAO / Boîte à outils, 16 septembre 2026) — API
 * Files + Messages/Citations, toutes les deux hors bêta dans le SDK installé
 * (vérifié directement dans node_modules/@anthropic-ai/sdk, jamais deviné) :
 * `client.files.*`/`client.messages.*` directement, pas `client.beta.*`.
 *
 * Construit même si ANTHROPIC_API_KEY est absente (env.ts, optionnelle) —
 * le SDK ne lève rien à la construction avec une clé absente (vérifié dans
 * node_modules/@anthropic-ai/sdk/client.js), seulement au premier appel
 * réel. Voir assertAnthropicConfigured ci-dessous pour échouer plus tôt,
 * avec un message clair, plutôt que de laisser le SDK échouer plus loin.
 */
export const anthropic = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });

/** Voir la liste des modèles disponibles — le plus capable, à utiliser par défaut pour toute nouvelle intégration. */
export const AI_MODEL = "claude-sonnet-5";

/**
 * Garde d'entrée pour chaque fonction qui appelle réellement l'IA
 * (uploadDocumentToAnthropic, runCitedCompletion, extractBordereauLines) —
 * échoue proprement (503, message actionnable) plutôt que de laisser
 * échouer une opération intermédiaire (upload Storage déjà fait, etc.)
 * ou un message d'erreur interne du SDK moins clair.
 */
export function assertAnthropicConfigured(): void {
  if (!env.ANTHROPIC_API_KEY) {
    throw new HttpError(503, "L'intégration IA n'est pas encore configurée (ANTHROPIC_API_KEY manquante) — contacter Direction.");
  }
}
