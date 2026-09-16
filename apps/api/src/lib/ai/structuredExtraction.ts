import Anthropic from "@anthropic-ai/sdk";
import { anthropic, AI_MODEL, assertAnthropicConfigured } from "./client.js";
import { toHttpError } from "./errors.js";

const BORDEREAU_TOOL_NAME = "record_bordereau_lines";
const SEAO_RESUME_ADMIN_TOOL_NAME = "record_seao_resume_and_administration";

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

export interface SeaoResumeAndAdministrationExtraction {
  summary: string;
  adminItems: SeaoAdministrationItem[];
  inputTokens: number;
  outputTokens: number;
}

interface RawSeaoResumeAndAdministration extends RawSeaoAdministration {
  summary: string;
}

/**
 * Résumé + points administratifs d'un SEAO EN UN SEUL appel structuré —
 * fusionnés le 16 septembre 2026 (demande explicite de Marie, après avoir
 * remarqué le coût réel de 4 appels IA distincts par analyse sur
 * console.anthropic.com). Toujours SÉPARÉ des Détails techniques
 * (runCitedCompletion, seao/service.ts) et du bordereau
 * (extractBordereauLines ci-dessus) — Citations et sortie structurée ne se
 * combinent pas dans le même appel, donc le Résumé perd ses citations en
 * échange d'un appel de moins : compromis accepté par Marie, elle garde les
 * citations là où ça compte le plus pour elle (Détails techniques, pour
 * vérifier mesures/contraintes contre le devis) plutôt que sur un résumé
 * général qu'elle ne vérifie pas ligne par ligne de toute façon.
 *
 * Chaque champ administratif reste un texte COURT (quelques mots) — jamais
 * une phrase complète ni une citation du contrat — et un champ absent des
 * documents devient "Non mentionné" plutôt qu'omis en silence, même
 * principe que l'ancienne checklist à 11 points. summary reste stocké dans
 * SeaoAnalysis.summaryContent SOUS LA MÊME FORME que l'ancien résumé cité
 * (un tableau à un seul bloc {type:"text", text}, sans citations) — le
 * frontend (CitedText) n'a donc eu besoin d'AUCUNE modification, il affiche
 * simplement un bloc sans badge de citation.
 */
export async function extractSeaoResumeAndAdministration(
  documents: { anthropicFileId: string; title: string }[],
): Promise<SeaoResumeAndAdministrationExtraction> {
  assertAnthropicConfigured();
  const adminProperties = Object.fromEntries(Object.keys(SEAO_ADMIN_FIELD_LABELS).map((key) => [key, { type: "string" }]));
  const tool: Anthropic.Tool = {
    name: SEAO_RESUME_ADMIN_TOOL_NAME,
    description:
      'Enregistre le résumé et les points administratifs de cet appel d\'offres. "summary" : quelques phrases décrivant l\'objet de l\'appel d\'offres (ce qui est demandé) et le contexte général du projet — jamais les détails techniques ni les points administratifs, couverts par les autres champs. Les points administratifs doivent être courts (quelques mots : montant, pourcentage, date, ou « oui »/« non » suivi d\'un détail bref) — jamais une phrase complète ni une citation du contrat. Si un point administratif n\'est pas mentionné dans les documents, réponds exactement « Non mentionné ».',
    input_schema: {
      type: "object",
      properties: { summary: { type: "string" }, ...adminProperties },
      required: ["summary", ...Object.keys(SEAO_ADMIN_FIELD_LABELS)],
    },
  };

  try {
    const response = await anthropic.messages.create({
      model: AI_MODEL,
      max_tokens: 2048,
      tools: [tool],
      tool_choice: { type: "tool", name: SEAO_RESUME_ADMIN_TOOL_NAME },
      messages: [
        {
          role: "user",
          content: [
            ...buildPlainDocumentBlocks(documents),
            { type: "text", text: "Résume cet appel d'offres et relève ses points administratifs." },
          ],
        },
      ],
    });

    const toolUse = response.content.find((block): block is Anthropic.ToolUseBlock => block.type === "tool_use");
    const input = (toolUse?.input as Partial<RawSeaoResumeAndAdministration> | undefined) ?? {};
    const adminItems = (Object.keys(SEAO_ADMIN_FIELD_LABELS) as (keyof RawSeaoAdministration)[]).map((key) => ({
      label: SEAO_ADMIN_FIELD_LABELS[key],
      value: input[key]?.trim() || NOT_MENTIONED,
    }));
    return {
      summary: input.summary?.trim() || NOT_MENTIONED,
      adminItems,
      inputTokens: response.usage.input_tokens,
      outputTokens: response.usage.output_tokens,
    };
  } catch (err) {
    throw toHttpError(err);
  }
}
