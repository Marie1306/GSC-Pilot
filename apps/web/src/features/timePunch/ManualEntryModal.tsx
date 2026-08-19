import { useRef, useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { canPunchForOtherEmployee, canSeeFinancialValues } from "@gsc-pilot/business-rules";
import { useAuth } from "../../lib/auth/useAuth.js";
import { ApiError } from "../../lib/apiClient.js";
import { fetchTechLevels } from "../settings/api.js";
import {
  fetchPunchableTasks,
  fetchProjectOptions,
  fetchServiceCallOptions,
  fetchPunchableEmployees,
  createManualEntry,
  updateTimeEntry,
  type TimeEntryDto,
} from "./api.js";
import { ManualEntryRow, type ManualRowState } from "./ManualEntryRow.js";

interface ManualEntryModalProps {
  onClose: () => void;
  /** Présent = mode correction d'un punch existant (canEditOwnPunch/Direction) plutôt que création. */
  entry?: TimeEntryDto;
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

function minutesToHours(minutes: number | null): string {
  return minutes ? String(Math.round((minutes / 60) * 100) / 100) : "1";
}

function makeEmptyRow(key: number): ManualRowState {
  return { key, value: { projectType: "internal", taskId: "" }, hours: "1", note: "", blockageNote: "" };
}

/** Échec en cours de lot — combien de lignes ont déjà été enregistrées avant l'erreur, pour ne jamais les resoumettre en double au prochain essai. */
class ManualBatchError extends Error {
  constructor(
    public succeededCount: number,
    public cause: unknown,
  ) {
    super("batch-partial-failure");
  }
}

/**
 * Entrée manuelle — travail déjà terminé, saisi après coup (heures directes,
 * pas de chronomètre). Deux modes bien distincts :
 * - Correction d'un punch existant (entry fourni) : une seule ligne, la
 *   personne et la date ne se réaffectent jamais ici.
 * - Création (entry absent) : plusieurs lignes possibles pour un même
 *   employé/date en une seule fois (repris du prototype v19,
 *   manualTimeBatchFormV06 — demandé le 19 août 2026) — chaque ligne
 *   garde sa propre référence/tâche/heures/note/blocage, soumises une à
 *   une (createManualEntry existant, jamais réimplémenté). En cas
 *   d'échec en cours de route, les lignes déjà enregistrées sont
 *   retirées du formulaire pour ne jamais les soumettre deux fois.
 */
export function ManualEntryModal({ onClose, entry }: ManualEntryModalProps) {
  const { employee } = useAuth();
  const queryClient = useQueryClient();
  const tasksQuery = useQuery({ queryKey: ["punchable-tasks"], queryFn: fetchPunchableTasks });
  const projectsQuery = useQuery({ queryKey: ["time-entries", "project-options"], queryFn: fetchProjectOptions });
  const serviceCallsQuery = useQuery({ queryKey: ["time-entries", "service-call-options"], queryFn: fetchServiceCallOptions });
  const techLevelsQuery = useQuery({ queryKey: ["tech-levels"], queryFn: fetchTechLevels });
  const canChooseEmployee = !entry && employee ? canPunchForOtherEmployee(employee.persona) : false;
  const employeesQuery = useQuery({
    queryKey: ["time-entries", "employees"],
    queryFn: fetchPunchableEmployees,
    enabled: canChooseEmployee,
  });

  const [employeeId, setEmployeeId] = useState(entry?.employeeId ?? employee?.id ?? "");
  const [date] = useState(entry?.date ?? today());
  const nextRowKey = useRef(1);
  const [rows, setRows] = useState<ManualRowState[]>(() => [
    entry
      ? {
          key: 0,
          value: {
            projectType: entry.projectType,
            projectId: entry.projectId ?? undefined,
            serviceCallId: entry.serviceCallId ?? undefined,
            taskId: entry.taskId ?? "",
            techLevelId: entry.techLevelId ?? undefined,
            rateType: entry.rateType ?? undefined,
          },
          hours: minutesToHours(entry.roundedMinutes ?? null),
          note: entry.note ?? "",
          blockageNote: entry.blockageNote ?? "",
        }
      : makeEmptyRow(0),
  ]);
  const [error, setError] = useState<string | null>(null);

  const tasks = tasksQuery.data?.tasks ?? [];
  const projects = projectsQuery.data?.projects ?? [];
  const serviceCalls = serviceCallsQuery.data?.serviceCalls ?? [];
  const techLevels = techLevelsQuery.data?.techLevels ?? [];
  const punchableEmployees = employeesQuery.data?.employees ?? [];
  const employeeTechLevelIds = canChooseEmployee
    ? (punchableEmployees.find((candidate) => candidate.id === employeeId)?.techLevelIds ?? [])
    : (employee?.techLevelIds ?? []);

  function updateRow(key: number, patch: Partial<Omit<ManualRowState, "key">>) {
    setRows((current) => current.map((row) => (row.key === key ? { ...row, ...patch } : row)));
  }

  function addRow() {
    setRows((current) => [...current, makeEmptyRow(nextRowKey.current++)]);
  }

  function removeRow(key: number) {
    setRows((current) => (current.length > 1 ? current.filter((row) => row.key !== key) : current));
  }

  const invalidate = () => void queryClient.invalidateQueries({ queryKey: ["time-entries"] });

  const editMutation = useMutation({
    mutationFn: () => {
      const row = rows[0]!;
      return updateTimeEntry(entry!.id, {
        projectType: row.value.projectType,
        projectId: row.value.projectId,
        serviceCallId: row.value.serviceCallId,
        taskId: row.value.taskId,
        hours: Number(row.hours),
        note: row.note.trim() || undefined,
        blockageNote: row.blockageNote.trim() || null,
      });
    },
    onSuccess: () => {
      invalidate();
      onClose();
    },
    onError: (err) => setError(err instanceof ApiError ? err.message : "Erreur — vérifiez les champs."),
  });

  const createMutation = useMutation({
    mutationFn: async () => {
      let succeededCount = 0;
      try {
        for (const row of rows) {
          await createManualEntry({
            employeeId,
            date,
            hours: Number(row.hours),
            projectType: row.value.projectType,
            projectId: row.value.projectId,
            serviceCallId: row.value.serviceCallId,
            taskId: row.value.taskId,
            techLevelId: row.value.techLevelId,
            rateType: row.value.rateType,
            note: row.note.trim() || undefined,
            blockageNote: row.blockageNote.trim() || undefined,
          });
          succeededCount++;
        }
      } catch (err) {
        throw new ManualBatchError(succeededCount, err);
      }
    },
    onSuccess: () => {
      invalidate();
      onClose();
    },
    onError: (err) => {
      if (err instanceof ManualBatchError) {
        if (err.succeededCount > 0) {
          setRows((current) => current.slice(err.succeededCount));
          invalidate();
        }
        const cause = err.cause instanceof ApiError ? err.cause.message : "Erreur — vérifiez les champs.";
        setError(
          err.succeededCount > 0
            ? `Entrée ${err.succeededCount + 1} : ${cause} — les ${err.succeededCount} entrée(s) précédente(s) ont déjà été enregistrée(s).`
            : `Entrée 1 : ${cause}`,
        );
      } else {
        setError("Erreur — vérifiez les champs.");
      }
    },
  });

  const mutation = entry ? editMutation : createMutation;

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    for (const [i, row] of rows.entries()) {
      if (!row.value.taskId) {
        setError(`Entrée ${i + 1} : choisissez une tâche.`);
        return;
      }
      if (!(Number(row.hours) > 0)) {
        setError(`Entrée ${i + 1} : le nombre d'heures doit être positif.`);
        return;
      }
    }
    mutation.mutate();
  }

  const showRate = employee ? canSeeFinancialValues(employee.persona) : false;

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" style={{ maxWidth: 720 }} onClick={(event) => event.stopPropagation()}>
        <div className="modal-header">
          <div>
            <h2>{entry ? "Modifier le punch" : "Entrée manuelle"}</h2>
            <p className="modal-subtitle">
              {entry
                ? "Correction avant approbation — la personne et la date ne changent jamais ici."
                : "Pour du travail déjà terminé — un employé, une date, une ou plusieurs entrées."}
            </p>
          </div>
          <button type="button" className="modal-close" onClick={onClose} aria-label="Fermer">
            ×
          </button>
        </div>
        <form onSubmit={handleSubmit}>
          <div className="modal-body">
            <div className="form-grid">
              {canChooseEmployee && (
                <div className="field field-full">
                  <label htmlFor="manual-employee">Employé</label>
                  <select id="manual-employee" value={employeeId} onChange={(event) => setEmployeeId(event.target.value)}>
                    {punchableEmployees.map((candidate) => (
                      <option key={candidate.id} value={candidate.id}>
                        {candidate.name}
                      </option>
                    ))}
                  </select>
                </div>
              )}
              <div className="field">
                <label htmlFor="manual-date">Date</label>
                <input id="manual-date" type="date" required readOnly={!!entry} disabled={!!entry} value={date} onChange={() => {}} />
              </div>
            </div>

            {rows.map((row, index) => (
              <ManualEntryRow
                key={row.key}
                row={row}
                index={index}
                onChange={(patch) => updateRow(row.key, patch)}
                onRemove={!entry && rows.length > 1 ? () => removeRow(row.key) : undefined}
                tasks={tasks}
                projects={projects}
                serviceCalls={serviceCalls}
                employeeTechLevelIds={employeeTechLevelIds}
                techLevels={techLevels}
                showRate={showRate}
              />
            ))}

            {!entry && (
              <button type="button" className="btn btn-secondary btn-small" onClick={addRow} style={{ marginTop: 4 }}>
                + Ajouter une entrée
              </button>
            )}
          </div>
          {error && <p className="form-error" style={{ margin: "0 24px 16px" }}>{error}</p>}
          <div className="modal-footer">
            <button type="button" className="btn btn-secondary" onClick={onClose}>
              Annuler
            </button>
            <button type="submit" className="btn" disabled={mutation.isPending}>
              {mutation.isPending ? "Enregistrement…" : entry ? "Enregistrer les modifications" : "Enregistrer et soumettre"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
