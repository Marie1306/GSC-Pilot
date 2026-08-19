import { useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { canPunchForOtherEmployee, canSeeFinancialValues } from "@gsc-pilot/business-rules";
import { useAuth } from "../../lib/auth/useAuth.js";
import { fetchTechLevels } from "../settings/api.js";
import { fetchPunchableTasks, fetchProjectOptions, fetchServiceCallOptions, fetchPunchableEmployees, startTimer } from "./api.js";
import { ReferenceFields, type ReferenceValue } from "./ReferenceFields.js";

interface StartTaskModalProps {
  onClose: () => void;
}

/** « Débuter une tâche » — v19 (référence visuelle), champs vérifiés contre la spécification confirmée (voir ReferenceFields). */
export function StartTaskModal({ onClose }: StartTaskModalProps) {
  const { employee } = useAuth();
  const queryClient = useQueryClient();
  const tasksQuery = useQuery({ queryKey: ["punchable-tasks"], queryFn: fetchPunchableTasks });
  const projectsQuery = useQuery({ queryKey: ["time-entries", "project-options"], queryFn: fetchProjectOptions });
  const serviceCallsQuery = useQuery({ queryKey: ["time-entries", "service-call-options"], queryFn: fetchServiceCallOptions });
  const techLevelsQuery = useQuery({ queryKey: ["tech-levels"], queryFn: fetchTechLevels });
  const canChooseEmployee = employee ? canPunchForOtherEmployee(employee.persona) : false;
  const employeesQuery = useQuery({
    queryKey: ["time-entries", "employees"],
    queryFn: fetchPunchableEmployees,
    enabled: canChooseEmployee,
  });

  const [employeeId, setEmployeeId] = useState(employee?.id ?? "");
  const [value, setValue] = useState<ReferenceValue>({ projectType: "internal", taskId: "" });
  const [note, setNote] = useState("");
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
      startTimer({
        employeeId,
        projectType: value.projectType,
        projectId: value.projectId,
        serviceCallId: value.serviceCallId,
        taskId: value.taskId,
        techLevelId: value.techLevelId,
        rateType: value.rateType,
        note: note.trim() || undefined,
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
    mutation.mutate();
  }

  return (
    <div className="modal-backdrop">
      <div className="modal">
        <div className="modal-header">
          <div>
            <h2>Débuter une tâche</h2>
            <p className="modal-subtitle">Le chronomètre démarre à l'enregistrement.</p>
          </div>
          <button type="button" className="modal-close" onClick={onClose} aria-label="Fermer">
            ×
          </button>
        </div>
        <form onSubmit={handleSubmit}>
          <div className="modal-body form-grid">
            {canChooseEmployee && (
              <div className="field field-full">
                <label htmlFor="punch-employee">Employé</label>
                <select id="punch-employee" value={employeeId} onChange={(event) => setEmployeeId(event.target.value)}>
                  {punchableEmployees.map((candidate) => (
                    <option key={candidate.id} value={candidate.id}>
                      {candidate.name}
                    </option>
                  ))}
                </select>
              </div>
            )}
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
              <label htmlFor="punch-note">Note (facultative)</label>
              <input id="punch-note" value={note} onChange={(event) => setNote(event.target.value)} />
            </div>
          </div>
          {error && <p className="form-error">{error}</p>}
          <div className="modal-footer">
            <button type="button" className="btn btn-secondary" onClick={onClose}>
              Annuler
            </button>
            <button type="submit" className="btn" disabled={mutation.isPending}>
              {mutation.isPending ? "Démarrage…" : "Démarrer maintenant"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
