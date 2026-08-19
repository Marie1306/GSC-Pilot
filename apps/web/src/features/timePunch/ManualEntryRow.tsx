import { ReferenceFields, type ReferenceValue } from "./ReferenceFields.js";
import type { PunchableTaskDto, ProjectOptionDto, ServiceCallOptionDto } from "./api.js";
import type { TechLevelDto } from "../settings/api.js";
import "./timePunch.css";

export interface ManualRowState {
  key: number;
  value: ReferenceValue;
  hours: string;
  note: string;
  blockageNote: string;
}

interface ManualEntryRowProps {
  row: ManualRowState;
  index: number;
  onChange: (patch: Partial<Omit<ManualRowState, "key">>) => void;
  onRemove?: () => void;
  tasks: PunchableTaskDto[];
  projects: ProjectOptionDto[];
  serviceCalls: ServiceCallOptionDto[];
  employeeTechLevelIds: string[];
  techLevels: TechLevelDto[];
  showRate: boolean;
}

/** Une ligne d'entrée manuelle (référence/tâche/heures/note/blocage) — réutilisée pour la correction d'un punch (une seule ligne) et pour chaque ligne d'une saisie en lot. */
export function ManualEntryRow({
  row,
  index,
  onChange,
  onRemove,
  tasks,
  projects,
  serviceCalls,
  employeeTechLevelIds,
  techLevels,
  showRate,
}: ManualEntryRowProps) {
  return (
    <div className="manual-entry-row">
      {onRemove && (
        <div className="manual-entry-row-header">
          <span>Entrée {index + 1}</span>
          <button type="button" className="icon-btn" onClick={onRemove} aria-label="Retirer cette entrée">
            ×
          </button>
        </div>
      )}
      <div className="form-grid">
        <div className="field">
          <label htmlFor={`manual-hours-${row.key}`}>Heures exactes</label>
          <input
            id={`manual-hours-${row.key}`}
            type="number"
            min="0.01"
            step="0.01"
            required
            value={row.hours}
            onChange={(event) => onChange({ hours: event.target.value })}
          />
        </div>
        <ReferenceFields
          value={row.value}
          onChange={(patch) => onChange({ value: { ...row.value, ...patch } })}
          tasks={tasks}
          projects={projects}
          serviceCalls={serviceCalls}
          employeeTechLevelIds={employeeTechLevelIds}
          techLevels={techLevels}
          showRate={showRate}
        />
        <div className="field field-full">
          <label htmlFor={`manual-note-${row.key}`}>Note (facultative)</label>
          <input id={`manual-note-${row.key}`} value={row.note} onChange={(event) => onChange({ note: event.target.value })} />
        </div>
        <div className="field field-full">
          <label htmlFor={`manual-blockage-${row.key}`}>Blocage signalé (facultatif)</label>
          <input
            id={`manual-blockage-${row.key}`}
            placeholder="Ex. pièce manquante, en attente d'une information"
            value={row.blockageNote}
            onChange={(event) => onChange({ blockageNote: event.target.value })}
          />
        </div>
      </div>
    </div>
  );
}
