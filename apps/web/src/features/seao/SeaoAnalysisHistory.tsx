import { CitedText } from "../../components/CitedText.js";
import type { SeaoAnalysisDto } from "./api.js";

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString("fr-CA", { year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
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
          <p style={{ fontWeight: 600, fontSize: 13, margin: "8px 0 4px" }}>Résumé</p>
          <CitedText content={analysis.summaryContent} />
        </div>
      ))}
    </div>
  );
}
