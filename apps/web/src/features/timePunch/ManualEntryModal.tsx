import { useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { canPunchForOtherEmployee, canSeeFinancialValues } from "@gsc-pilot/business-rules";
import { useAuth } from "../../lib/auth/useAuth.js";
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
import { ReferenceFields, type ReferenceValue } from "./ReferenceFields.js";

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

/**
 * Entrée manuelle — travail déjà terminé, saisi après coup (heures directes,
 * pas de chronomètre). Réutilisé pour la correction d'un punch existant
 * (mêmes champs référence/tâche/heures/note — voir spec « l'employé peut
 * corriger son propre punch avant approbation », Direction à tout moment) :
 * la personne et la date ne se réaffectent jamais ici, seulement la
 * référence/tâche/durée/notes.
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
  const [hours, setHours] = useState(minutesToHours(entry?.roundedMinutes ?? null));
  const [value, setValue] = useState<ReferenceValue>(
    entry
      ? {
          projectType: entry.projectType,
          projectId: entry.projectId ?? undefined,
          serviceCallId: entry.serviceCallId ?? undefined,
          taskId: entry.taskId ?? "",
          techLevelId: entry.techLevelId ?? undefined,
          rateType: entry.rateType ?? undefined,
        }
      : { projectType: "internal", taskId: "" },
  );
  const [note, setNote] = useState(entry?.note ?? "");
  const [blockageNote, setBlockageNote] = useState(entry?.blockageNote ?? "");
  const [error, setError] = useState<string | null>(null);

  const tasks = tasksQuery.data?.tasks ?? [];
  const projects = projectsQuery.data?.projects ?? [];
  const serviceCalls = serviceCallsQuery.data?.serviceCalls ?? [];
  const techLevels = techLevelsQuery.data?.techLevels ?? [];
  const punchableEmployees = employeesQuery.data?.employees ?? [];
  const employeeTechLevelIds = canChooseEmployee
    ? punchableEmployees.find((candidate) => candidate.id === employeeId)?.techLevelIds ?? []
    : employee?.techLevelIds ?? [];

  const mutation = useMutation({
    mutationFn: () =>
      entry
        ? updateTimeEntry(entry.id, {
            projectType: value.projectType,
            projectId: value.projectId,
            serviceCallId: value.serviceCallId,
            taskId: value.taskId,
            hours: Number(hours),
            note: note.trim() || undefined,
            blockageNote: blockageNote.trim() || null,
          })
        : createManualEntry({
            employeeId,
            date,
            hours: Number(hours),
            projectType: value.projectType,
            projectId: value.projectId,
            serviceCallId: value.serviceCallId,
            taskId: value.taskId,
            techLevelId: value.techLevelId,
            rateType: value.rateType,
            note: note.trim() || undefined,
            blockageNote: blockageNote.trim() || undefined,
          }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["time-entries"] });
      onClose();
    },
    onError: (err) => setError(err instanceof Error ? err.message : "Erreur — vérifiez les champs."),
  });

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    if (!value.taskId) {
      setError("Choisissez une tâche.");
      return;
    }
    if (!(Number(hours) > 0)) {
      setError("Le nombre d'heures doit être positif.");
      return;
    }
    mutation.mutate();
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(event) => event.stopPropagation()}>
        <div className="modal-header">
          <div>
            <h2>{entry ? "Modifier le punch" : "Entrée manuelle"}</h2>
            <p className="modal-subtitle">
              {entry
                ? "Correction avant approbation — la personne et la date ne changent jamais ici."
                : "Pour du travail déjà terminé — heures exactes saisies directement."}
            </p>
          </div>
          <button type="button" className="modal-close" onClick={onClose} aria-label="Fermer">
            ×
          </button>
        </div>
        <form onSubmit={handleSubmit}>
          <div className="modal-body form-grid">
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
            <div className="field">
              <label htmlFor="manual-hours">Heures exactes</label>
              <input
                id="manual-hours"
                type="number"
                min="0.01"
                step="0.01"
                required
                value={hours}
                onChange={(event) => setHours(event.target.value)}
              />
            </div>
            <ReferenceFields
              value={value}
              onChange={(patch) => setValue((current) => ({ ...current, ...patch }))}
              tasks={tasks}
              projects={projects}
              serviceCalls={serviceCalls}
              employeeTechLevelIds={employeeTechLevelIds}
              techLevels={techLevels}
              showRate={employee ? canSeeFinancialValues(employee.persona) : false}
            />
            <div className="field field-full">
              <label htmlFor="manual-note">Note (facultative)</label>
              <input id="manual-note" value={note} onChange={(event) => setNote(event.target.value)} />
            </div>
            <div className="field field-full">
              <label htmlFor="manual-blockage">Blocage signalé (facultatif)</label>
              <input
                id="manual-blockage"
                placeholder="Ex. pièce manquante, en attente d'une information"
                value={blockageNote}
                onChange={(event) => setBlockageNote(event.target.value)}
              />
            </div>
          </div>
          {error && <p className="form-error">{error}</p>}
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
