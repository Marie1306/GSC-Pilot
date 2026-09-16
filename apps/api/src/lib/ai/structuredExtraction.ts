import Anthropic from "@anthropic-ai/sdk";
import { anthropic, AI_MODEL, assertAnthropicConfigured } from "./client.js";
import { toHttpError } from "./errors.js";

const BORDEREAU_TOOL_NAME = "record_bordereau_lines";
const SEAO_ADMIN_TOOL_NAME = "record_seao_administration";

export interface ExtractedBordereauLine {
  description: string;
}

/** Une ligne de la liste Administration telle que stockée/affichée — voir SeaoAnalysis.adminContent, SeaoAdministrationList.tsx. */
export interface SeaoAdministrationItem {
  label: string;
  value: string;
}

interface RawSeaoAdministration {
  targetDeliveryDate: string;
  mandatorySiteVisit: string;
  bidBond: string;
  performanceBond: string;
  productWarranty: string;
  insurance: string;
  certifications: string;
}

/**
 * Ordre et libellés confirmés avec Marie le 16 septembre 2026 — remplace la
 * checklist à 11 points à plat (SEAO_SUMMARY_SYSTEM_PROMPT, seao/service.ts)
 * pour la partie administrative : une liste courte au lieu d'un paragraphe
 * qui réécrit la ligne complète du contrat. Volontairement SANS "charte de
 * la langue française" ni "attestation de Revenu Québec" — exigées d'emblée
 * pour chaque SEAO, jamais distinctives, jamais utiles à afficher (demande
 * explicite) ; l'absence de ces 2 champs du schéma de l'outil ci-dessous
 * rend structurellement impossible pour l'IA de les faire réapparaître,
 * plutôt que de compter sur une instruction "ignore-les" dans le prompt.
 */
const SEAO_ADMIN_FIELD_LABELS: Record<keyof RawSeaoAdministration, string> = {
  targetDeliveryDate: "Date cible de livraison",
  mandatorySiteVisit: "Visite des lieux obligatoire",
  certifications: "Certifications exigées",
  productWarranty: "Garantie sur le produit livré",
  bidBond: "Garantie de soumission",
  performanceBond: "Cautionnement d'exécution",
  insurance: "Assurances exigées",
};

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
  assertAnthropicConfigured();
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

const NOT_MENTIONED = "Non mentionné";

/**
 * Extraction structurée des points administratifs d'un SEAO — appel
 * Anthropic SÉPARÉ de l'analyse citée, même raison que extractBordereauLines
 * ci-dessus (Citations et sortie structurée ne se combinent pas). Chaque
 * champ est un texte COURT (quelques mots : montant, pourcentage, date,
 * oui/non) — jamais une phrase complète ni une citation du contrat, demande
 * explicite de Marie pour que ça se lise comme une liste, pas un résumé.
 * Un champ absent des documents devient "Non mentionné" plutôt qu'omis en
 * silence — même principe que l'ancienne checklist à 11 points qu'elle
 * remplace.
 */
export async function extractSeaoAdministration(documents: { anthropicFileId: string; title: string }[]): Promise<SeaoAdministrationItem[]> {
  assertAnthropicConfigured();
  const properties = Object.fromEntries(
    Object.keys(SEAO_ADMIN_FIELD_LABELS).map((key) => [key, { type: "string" }]),
  );
  const tool: Anthropic.Tool = {
    name: SEAO_ADMIN_TOOL_NAME,
    description:
      "Enregistre les points administratifs de cet appel d'offres. Chaque valeur doit être courte (quelques mots : montant, pourcentage, date, ou « oui »/« non » suivi d'un détail bref) — jamais une phrase complète ni une citation du contrat. Si un point n'est pas mentionné dans les documents, réponds exactement « Non mentionné ».",
    input_schema: {
      type: "object",
      properties,
      required: Object.keys(SEAO_ADMIN_FIELD_LABELS),
    },
  };

  try {
    const response = await anthropic.messages.create({
      model: AI_MODEL,
      max_tokens: 1024,
      tools: [tool],
      tool_choice: { type: "tool", name: SEAO_ADMIN_TOOL_NAME },
      messages: [
        {
          role: "user",
          content: [
            ...buildPlainDocumentBlocks(documents),
            { type: "text", text: "Relève les points administratifs de cet appel d'offres." },
          ],
        },
      ],
    });

    const toolUse = response.content.find((block): block is Anthropic.ToolUseBlock => block.type === "tool_use");
    const input = (toolUse?.input as Partial<RawSeaoAdministration> | undefined) ?? {};
    return (Object.keys(SEAO_ADMIN_FIELD_LABELS) as (keyof RawSeaoAdministration)[]).map((key) => ({
      label: SEAO_ADMIN_FIELD_LABELS[key],
      value: input[key]?.trim() || NOT_MENTIONED,
    }));
  } catch (err) {
    throw toHttpError(err);
  }
}
