import Anthropic from "@anthropic-ai/sdk";
import { env } from "../../env.js";

/**
 * Client Anthropic partagé (SEAO / Boîte à outils, 16 septembre 2026) — API
 * Files + Messages/Citations, toutes les deux hors bêta dans le SDK installé
 * (vérifié directement dans node_modules/@anthropic-ai/sdk, jamais deviné) :
 * `client.files.*`/`client.messages.*` directement, pas `client.beta.*`.
 */
export const anthropic = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });

/** Voir la liste des modèles disponibles — le plus capable, à utiliser par défaut pour toute nouvelle intégration. */
export const AI_MODEL = "claude-sonnet-5";
