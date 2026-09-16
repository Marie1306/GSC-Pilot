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
  /** Forme brute stockée par le serveur (SeaoAnalysis.summaryContent/changesContent/technicalContent, ToolboxMessage.content) — jamais reformatée, voir apps/api/src/lib/ai/citedCompletion.ts. */
  content: CitedTextBlock[];
  /** "bullets" — une puce par point plutôt qu'un paragraphe par bloc (Détails techniques SEAO, 16 septembre 2026, pour distinguer chaque exigence du devis). Défaut inchangé partout ailleurs (Résumé, Changements, Boîte à outils). */
  variant?: "paragraphs" | "bullets";
}

function CitedRefs({ citations }: { citations: CitedTextCitation[] }) {
  if (citations.length === 0) return null;
  return (
    <span className="cited-text-refs">
      {citations.map((citation, index) => (
        <span key={index} className="cited-text-ref" title={citation.cited_text}>
          {citation.document_title ?? "Document"}
          {citation.start_page_number !== undefined ? ` — p.${citation.start_page_number}` : ""}
        </span>
      ))}
    </span>
  );
}

interface BulletItem {
  text: string[];
  citations: CitedTextCitation[];
}

/**
 * Regroupe les blocs cités en puces — un nouveau point à chaque ligne qui
 * commence par un marqueur ("- "/"• "/"* ", voir SEAO_TECHNICAL_SYSTEM_PROMPT),
 * les lignes/blocs suivants sans marqueur prolongent le point courant
 * (l'API Citations peut fractionner un même point en plusieurs blocs autour
 * d'une citation — jamais garanti qu'un point = un bloc). Une ligne avant
 * le premier marqueur démarre quand même un premier point plutôt que
 * d'être perdue, au cas où le modèle n'a pas suivi le format à la lettre.
 */
function groupIntoBullets(blocks: CitedTextBlock[]): BulletItem[] {
  const items: BulletItem[] = [];
  const bulletMarker = /^[-•*]\s+(.*)/;
  for (const block of blocks) {
    const lines = (block.text ?? "").split("\n");
    for (const rawLine of lines) {
      const line = rawLine.trim();
      if (line.length === 0) continue;
      const match = bulletMarker.exec(line);
      const text = match?.[1] ?? line;
      const current = items.at(-1);
      if (match || !current) {
        items.push({ text: [text], citations: [...(block.citations ?? [])] });
      } else {
        current.text.push(text);
        current.citations.push(...(block.citations ?? []));
      }
    }
  }
  return items;
}

/**
 * Rend un tableau de blocs Anthropic {text, citations?} avec un badge par
 * citation (survol = extrait cité, voir SeaoAnalysisHistory.tsx /
 * ToolboxChatThread.tsx). Les blocs non textuels (tool_use, etc.) sont
 * ignorés — jamais affichés à l'usagère.
 */
export function CitedText({ content, variant = "paragraphs" }: CitedTextProps) {
  const textBlocks = content.filter((block) => block.type === "text" && block.text);
  if (textBlocks.length === 0) return null;

  if (variant === "bullets") {
    const items = groupIntoBullets(textBlocks);
    if (items.length === 0) return null;
    return (
      <ul className="cited-text cited-text-bullets">
        {items.map((item, index) => (
          <li key={index}>
            {item.text.join(" ")}
            <CitedRefs citations={item.citations} />
          </li>
        ))}
      </ul>
    );
  }

  return (
    <div className="cited-text">
      {textBlocks.map((block, index) => (
        <p key={index}>
          {block.text}
          <CitedRefs citations={block.citations ?? []} />
        </p>
      ))}
    </div>
  );
}
