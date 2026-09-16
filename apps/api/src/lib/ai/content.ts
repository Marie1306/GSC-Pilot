/** Concatène le texte des blocs `text` d'un contenu Anthropic stocké (Json) — ignore les blocs document/tool_use/etc. Utilisé par SEAO (comparer une analyse à la précédente) et Boîte à outils (aperçu de la première question d'un fil). */
export function plainTextFromContent(content: unknown): string {
  if (!Array.isArray(content)) return "";
  return content
    .filter((block): block is { type: string; text?: string } => typeof block === "object" && block !== null && "type" in block)
    .filter((block) => block.type === "text" && typeof block.text === "string")
    .map((block) => block.text)
    .join("\n");
}
