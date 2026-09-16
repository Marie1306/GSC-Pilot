import { useState } from "react";
import { CitedText } from "../../components/CitedText.js";
import type { SeaoAdministrationItemDto, SeaoAnalysisDto } from "./api.js";

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString("fr-CA", { year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

/** Liste Administration — libellé/valeur courts, jamais de citations (voir extractSeaoResumeAndAdministration, structuredExtraction.ts). */
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

type SeaoAnalysisTab = "resume" | "admin" | "technical";
const TAB_LABELS: Record<SeaoAnalysisTab, string> = {
  resume: "Résumé",
  admin: "Administration",
  technical: "Détails techniques",
};
const MISSING_SECTION_HINT = "Non disponible pour cette version — relancez une analyse.";

/** Une version d'analyse — onglets confirmés avec Marie le 16 septembre 2026 (à la place d'un empilement vertical), Résumé par défaut, état indépendant par carte. */
function SeaoAnalysisCard({ analysis }: { analysis: SeaoAnalysisDto }) {
  const [tab, setTab] = useState<SeaoAnalysisTab>("resume");

  return (
    <div className="card" style={{ marginBottom: 10, background: "var(--gsc-color-surface2)" }}>
      <p className="note-meta" style={{ margin: "0 0 8px" }}>
        Version {analysis.version} · {analysis.requestedByName} · {formatDateTime(analysis.createdAt)}
      </p>
      {analysis.changesContent && (
        <>
          <p style={{ fontWeight: 600, fontSize: 13, margin: "0 0 8px" }}>Changements depuis la version précédente</p>
          <CitedText content={analysis.changesContent} />
        </>
      )}

      <div className="tabs" role="tablist" style={{ marginBottom: 10 }}>
        {(Object.keys(TAB_LABELS) as SeaoAnalysisTab[]).map((key) => (
          <button key={key} type="button" role="tab" aria-selected={tab === key} className={`tab ${tab === key ? "active" : ""}`} onClick={() => setTab(key)}>
            {TAB_LABELS[key]}
          </button>
        ))}
      </div>

      {tab === "resume" && <CitedText content={analysis.summaryContent} />}
      {tab === "admin" &&
        (analysis.adminContent ? <SeaoAdministrationList items={analysis.adminContent} /> : <p className="empty-hint">{MISSING_SECTION_HINT}</p>)}
      {tab === "technical" &&
        (analysis.technicalContent ? (
          <CitedText content={analysis.technicalContent} variant="bullets" />
        ) : (
          <p className="empty-hint">{MISSING_SECTION_HINT}</p>
        ))}
    </div>
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
        <SeaoAnalysisCard key={analysis.id} analysis={analysis} />
      ))}
    </div>
  );
}
