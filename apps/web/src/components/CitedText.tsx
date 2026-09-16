import "./sharedAi.css";

export interface CitedTextCitation {
  cited_text: string;
  document_title: string | null;
  start_page_number?: number;
  end_page_number?: number;
}

export interface CitedTextBlock {
  type: string;
  text?: string;
  citations?: CitedTextCitation[] | null;
}

interface CitedTextProps {
  /** Forme brute stockée par le serveur (SeaoAnalysis.summaryContent/changesContent, ToolboxMessage.content) — jamais reformatée, voir apps/api/src/lib/ai/citedCompletion.ts. */
  content: CitedTextBlock[];
}

/**
 * Rend un tableau de blocs Anthropic {text, citations?} avec un badge par
 * citation (survol = extrait cité, voir SeaoAnalysisHistory.tsx /
 * ToolboxChatThread.tsx). Les blocs non textuels (tool_use, etc.) sont
 * ignorés — jamais affichés à l'usagère.
 */
export function CitedText({ content }: CitedTextProps) {
  const textBlocks = content.filter((block) => block.type === "text" && block.text);
  if (textBlocks.length === 0) return null;

  return (
    <div className="cited-text">
      {textBlocks.map((block, index) => (
        <p key={index}>
          {block.text}
          {block.citations && block.citations.length > 0 && (
            <span className="cited-text-refs">
              {block.citations.map((citation, citationIndex) => (
                <span key={citationIndex} className="cited-text-ref" title={citation.cited_text}>
                  {citation.document_title ?? "Document"}
                  {citation.start_page_number !== undefined ? ` — p.${citation.start_page_number}` : ""}
                </span>
              ))}
            </span>
          )}
        </p>
      ))}
    </div>
  );
}
