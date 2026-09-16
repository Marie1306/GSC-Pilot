import Anthropic from "@anthropic-ai/sdk";
import { anthropic, AI_MODEL } from "./client.js";
import { toHttpError } from "./errors.js";

const BORDEREAU_TOOL_NAME = "record_bordereau_lines";

export interface ExtractedBordereauLine {
  description: string;
}

/** Sans citations (contrairement à runCitedCompletion) — cette extraction n'a besoin que de l'input de l'outil, jamais d'un texte cité en retour. */
function buildPlainDocumentBlocks(docs: { anthropicFileId: string; title: string }[]): Anthropic.DocumentBlockParam[] {
  return docs.map((doc, index) => ({
    type: "document",
    source: { type: "file", file_id: doc.anthropicFileId },
    title: doc.title,
    ...(index === docs.length - 1 ? { cache_control: { type: "ephemeral" as const } } : {}),
  }));
}

/**
 * Extraction structurée du bordereau de soumission — appel Anthropic
 * SÉPARÉ de l'analyse citée (runCitedCompletion, jamais combinés dans le
 * même appel : Citations et sortie structurée ne sont pas compatibles,
 * voir output_config du SDK). Outil forcé (tool_choice) plutôt qu'un
 * output_config structuré — pattern standard et bien documenté pour
 * extraire une liste.
 *
 * Le schéma ne contient AUCUN champ de prix — structurellement impossible
 * pour l'IA de suggérer un coût ou une marge, qui restent une saisie
 * humaine (voir SeaoBordereauLine, seao/service.ts : cette fonction n'est
 * appelée que si la table est encore vide, jamais pour écraser des lignes
 * déjà chiffrées à la main).
 */
export async function extractBordereauLines(documents: { anthropicFileId: string; title: string }[]): Promise<ExtractedBordereauLine[]> {
  const tool: Anthropic.Tool = {
    name: BORDEREAU_TOOL_NAME,
    description: "Enregistre les lignes du bordereau de soumission (une entrée par article/poste à chiffrer), dans l'ordre du document.",
    input_schema: {
      type: "object",
      properties: {
        lines: {
          type: "array",
          items: {
            type: "object",
            properties: { description: { type: "string" } },
            required: ["description"],
          },
        },
      },
      required: ["lines"],
    },
  };

  try {
    const response = await anthropic.messages.create({
      model: AI_MODEL,
      max_tokens: 4096,
      tools: [tool],
      tool_choice: { type: "tool", name: BORDEREAU_TOOL_NAME },
      messages: [
        {
          role: "user",
          content: [
            ...buildPlainDocumentBlocks(documents),
            { type: "text", text: "Extrais la liste des lignes du bordereau de soumission de cet appel d'offres, dans l'ordre." },
          ],
        },
      ],
    });

    const toolUse = response.content.find((block): block is Anthropic.ToolUseBlock => block.type === "tool_use");
    const input = toolUse?.input as { lines?: { description?: string }[] } | undefined;
    return (input?.lines ?? [])
      .map((line) => ({ description: (line.description ?? "").trim() }))
      .filter((line) => line.description.length > 0);
  } catch (err) {
    throw toHttpError(err);
  }
}
