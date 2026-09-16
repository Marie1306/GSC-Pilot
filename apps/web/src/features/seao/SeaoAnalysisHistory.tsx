import { CitedText } from "../../components/CitedText.js";
import type { SeaoAdministrationItemDto, SeaoAnalysisDto } from "./api.js";

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString("fr-CA", { year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

const SECTION_TITLE_STYLE = { fontWeight: 600, fontSize: 13, margin: "8px 0 4px" } as const;

/** Liste Administration — libellé/valeur courts, jamais de citations (voir extractSeaoAdministration, structuredExtraction.ts). */
function SeaoAdministrationList({ items }: { items: SeaoAdministrationItemDto[] }) {
  return (
    <ul className="seao-admin-list">
      {items.map((item) => (
        <li key={item.label}>
          <span className="seao-admin-label">{item.label}</span>
          <span className="seao-admin-value">{item.value}</span>
        </li>
      ))}
    </ul>
  );
}

/** Historique des analyses IA — la plus récente en premier (déjà trié par le serveur, voir seao/service.ts). */
export function SeaoAnalysisHistory({ analyses }: { analyses: SeaoAnalysisDto[] }) {
  if (analyses.length === 0) {
    return (
      <div style={{ marginBottom: 20 }}>
        <h3 style={{ fontSize: 15, marginBottom: 4 }}>Analyse</h3>
        <p className="empty-hint">Aucune analyse pour l'instant — déposez au moins un document, puis « Analyser les documents ».</p>
      </div>
    );
  }

  return (
    <div style={{ marginBottom: 20 }}>
      <h3 style={{ fontSize: 15, marginBottom: 4 }}>Analyse</h3>
      {analyses.map((analysis) => (
        <div key={analysis.id} className="card" style={{ marginBottom: 10, background: "var(--gsc-color-surface2)" }}>
          <p className="note-meta" style={{ margin: "0 0 8px" }}>
            Version {analysis.version} · {analysis.requestedByName} · {formatDateTime(analysis.createdAt)}
          </p>
          {analysis.changesContent && (
            <>
              <p style={{ fontWeight: 600, fontSize: 13, margin: "0 0 4px" }}>Changements depuis la version précédente</p>
              <CitedText content={analysis.changesContent} />
            </>
          )}
          <p style={SECTION_TITLE_STYLE}>Résumé</p>
          <CitedText content={analysis.summaryContent} />
          {analysis.adminContent && (
            <>
              <p style={SECTION_TITLE_STYLE}>Administration</p>
              <SeaoAdministrationList items={analysis.adminContent} />
            </>
          )}
          {analysis.technicalContent && (
            <>
              <p style={SECTION_TITLE_STYLE}>Détails techniques</p>
              <CitedText content={analysis.technicalContent} />
            </>
          )}
        </div>
      ))}
    </div>
  );
}
