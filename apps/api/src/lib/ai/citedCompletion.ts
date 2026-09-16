import Anthropic from "@anthropic-ai/sdk";
import { anthropic, AI_MODEL } from "./client.js";
import { toHttpError } from "./errors.js";
import { buildCitedDocumentBlocks } from "./documents.js";

export interface CitedCompletionInput {
  /** Documents à citer — ignorés si `history` n'est pas vide (déjà posés dans le premier message du fil, voir buildCitedDocumentBlocks). */
  documents: { anthropicFileId: string; title: string }[];
  /** Tours précédents, tels que stockés (SeaoAnalysis n'en a jamais, ToolboxMessage les recharge tels quels — voir en-tête du fichier). */
  history: Anthropic.MessageParam[];
  userText: string;
  system?: string;
  maxTokens?: number;
}

export interface CitedCompletionResult {
  /** Contenu EXACT envoyé pour ce tour utilisateur (documents inclus au premier tour) — à persister tel quel (voir ToolboxMessage.content) pour que la reconstruction d'historique d'un tour futur envoie exactement les mêmes blocs, jamais une approximation divergente. */
  userContent: Anthropic.ContentBlockParam[];
  content: Anthropic.ContentBlock[];
  inputTokens: number;
  outputTokens: number;
}

/**
 * Primitive partagée SEAO / Boîte à outils — un appel Anthropic avec
 * documents cités. SEAO (analyse ponctuelle) appelle avec `history: []` à
 * chaque version ; Boîte à outils (fil multi-tours, API stateless) appelle
 * avec `history` = tous les tours précédents rechargés depuis
 * ToolboxMessage.content.
 *
 * Les blocs `document` n'apparaissent QUE dans le tout premier message d'un
 * appel/fil (history vide) — jamais répétés à chaque tour, pour profiter du
 * cache de préfixe (voir cache_control, buildCitedDocumentBlocks).
 */
export async function runCitedCompletion(input: CitedCompletionInput): Promise<CitedCompletionResult> {
  const userBlocks: Anthropic.ContentBlockParam[] =
    input.history.length === 0
      ? [...buildCitedDocumentBlocks(input.documents), { type: "text", text: input.userText }]
      : [{ type: "text", text: input.userText }];

  const messages: Anthropic.MessageParam[] = [...input.history, { role: "user", content: userBlocks }];

  try {
    const response = await anthropic.messages.create({
      model: AI_MODEL,
      max_tokens: input.maxTokens ?? 4096,
      ...(input.system !== undefined && { system: input.system }),
      messages,
    });
    return { userContent: userBlocks, content: response.content, inputTokens: response.usage.input_tokens, outputTokens: response.usage.output_tokens };
  } catch (err) {
    throw toHttpError(err);
  }
}
