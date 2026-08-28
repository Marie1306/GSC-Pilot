import { BUDGET_CATEGORY_SLUGS } from "@gsc-pilot/business-rules";
import type { PunchableTaskDto, ProjectOptionDto, RollingOptionDto, ServiceCallOptionDto, PunchProjectType, RateType } from "./api.js";
import { RATE_TYPE_LABELS } from "./api.js";
import type { TechLevelDto } from "../settings/api.js";

export interface ReferenceValue {
  projectType: PunchProjectType;
  projectId?: string;
  rollingId?: string;
  serviceCallId?: string;
  taskId: string;
  techLevelId?: string;
  rateType?: RateType;
}

interface ReferenceFieldsProps {
  value: ReferenceValue;
  onChange: (patch: Partial<ReferenceValue>) => void;
  tasks: PunchableTaskDto[];
  projects: ProjectOptionDto[];
  rollings: RollingOptionDto[];
  serviceCalls: ServiceCallOptionDto[];
  employeeTechLevelIds: string[];
  techLevels: TechLevelDto[];
  showRate: boolean;
}

/** PunchableTaskDto.scope n'a pas de valeur "rolling" dédiée — le catalogue de tâches/catégories est générique par type de dossier, un roulement réutilise donc le scope "project" (28 août 2026, confirmé). */
function taskScopeFor(projectType: PunchProjectType): PunchableTaskDto["scope"] {
  return projectType === "rolling" ? "project" : projectType;
}

/** undefined pour Employé/Magasinier (voir TechLevelDto) — n'est de toute façon affiché que sous showRate. */
function rateForType(techLevel: TechLevelDto, rateType: RateType): number | undefined {
  if (rateType === "overtime") return techLevel.overtimeRate;
  if (rateType === "extra") return techLevel.extraRate;
  return techLevel.regularRate;
}

/**
 * Champs partagés « Débuter une tâche » / « Entrée manuelle » — référence
 * (projet/call de service/interne), tâche (PunchableTask, en cascade) et,
 * pour un call de service seulement, classe facturable + type de temps
 * (confirmé le 18 août 2026 : un employé peut avoir plusieurs classes
 * éligibles, celle qui s'applique se choisit ici selon la job — jamais
 * fixée sur l'employé). Tarif masqué si l'usager courant ne voit pas les
 * valeurs financières (showRate, dérivé de canSeeFinancialValues côté page).
 */
export function ReferenceFields({
  value,
  onChange,
  tasks,
  projects,
  rollings,
  serviceCalls,
  employeeTechLevelIds,
  techLevels,
  showRate,
}: ReferenceFieldsProps) {
  const tasksForScope = tasks.filter((task) => task.scope === taskScopeFor(value.projectType));
  const eligibleTechLevels = techLevels.filter((techLevel) => employeeTechLevelIds.includes(techLevel.id));
  const selectedTechLevel = eligibleTechLevels.find((techLevel) => techLevel.id === value.techLevelId);

  // Catégorie → tâche en cascade (18-19 août 2026) : la tâche choisie porte
  // déjà sa catégorie (PunchableTaskDto.category, dérivée serveur — jamais
  // soumise séparément ici, purement un filtre d'affichage). Triée sur
  // l'ordre canonique du budgétaire pour le scope "project" (Conception,
  // Fabrication, Programmation, Assemblage, Installation, comme les
  // sections du budgétaire) — internal/service n'ont qu'une seule
  // catégorie chacun, l'ordre n'a alors aucun effet visible.
  const canonicalOrder: readonly string[] = BUDGET_CATEGORY_SLUGS;
  const categoriesForScope = Array.from(new Map(tasksForScope.map((task) => [task.category, task.categoryLabel])).entries())
    .map(([category, categoryLabel]) => ({ category, categoryLabel }))
    .sort((a, b) => canonicalOrder.indexOf(a.category) - canonicalOrder.indexOf(b.category));
  const currentTask = tasksForScope.find((task) => task.id === value.taskId);
  const selectedCategory = currentTask?.category ?? categoriesForScope[0]?.category ?? "";
  const tasksForCategory = tasksForScope.filter((task) => task.category === selectedCategory);

  function handleProjectTypeChange(nextType: PunchProjectType) {
    const nextTasks = tasks.filter((task) => task.scope === taskScopeFor(nextType));
    onChange({
      projectType: nextType,
      projectId: undefined,
      rollingId: undefined,
      serviceCallId: undefined,
      taskId: nextTasks[0]?.id ?? "",
      techLevelId: undefined,
      rateType: undefined,
    });
  }

  function handleCategoryChange(nextCategory: string) {
    const firstTaskInCategory = tasksForScope.find((task) => task.category === nextCategory);
    onChange({ taskId: firstTaskInCategory?.id ?? "" });
  }

  return (
    <>
      <div className="field">
        <label htmlFor="punch-reference-type">Projet ou dossier</label>
        <select
          id="punch-reference-type"
          value={value.projectType}
          onChange={(event) => handleProjectTypeChange(event.target.value as PunchProjectType)}
        >
          <option value="project">Projet</option>
          <option value="rolling">Roulement</option>
          <option value="service">Appel de service</option>
          <option value="internal">Interne — Amélioration GSC</option>
        </select>
      </div>

      {value.projectType === "project" && (
        <div className="field">
          <label htmlFor="punch-project">Projet</label>
          <select id="punch-project" required value={value.projectId ?? ""} onChange={(event) => onChange({ projectId: event.target.value })}>
            <option value="" disabled>
              Sélectionner…
            </option>
            {projects.map((project) => (
              <option key={project.id} value={project.id}>
                {project.label}
              </option>
            ))}
          </select>
        </div>
      )}

      {value.projectType === "rolling" && (
        <div className="field">
          <label htmlFor="punch-rolling">Roulement</label>
          <select id="punch-rolling" required value={value.rollingId ?? ""} onChange={(event) => onChange({ rollingId: event.target.value })}>
            <option value="" disabled>
              Sélectionner…
            </option>
            {rollings.map((rolling) => (
              <option key={rolling.id} value={rolling.id}>
                {rolling.label}
              </option>
            ))}
          </select>
        </div>
      )}

      {value.projectType === "service" && (
        <div className="field">
          <label htmlFor="punch-service-call">Call de service</label>
          <select
            id="punch-service-call"
            required
            value={value.serviceCallId ?? ""}
            onChange={(event) => onChange({ serviceCallId: event.target.value })}
          >
            <option value="" disabled>
              {serviceCalls.length ? "Sélectionner…" : "Aucun call assigné"}
            </option>
            {serviceCalls.map((call) => (
              <option key={call.id} value={call.id}>
                {call.label}
              </option>
            ))}
          </select>
        </div>
      )}

      <div className="field">
        <label htmlFor="punch-category">Catégorie</label>
        <select id="punch-category" required value={selectedCategory} onChange={(event) => handleCategoryChange(event.target.value)}>
          <option value="" disabled>
            {categoriesForScope.length ? "Sélectionner…" : "Aucune catégorie"}
          </option>
          {categoriesForScope.map((category) => (
            <option key={category.category} value={category.category}>
              {category.categoryLabel}
            </option>
          ))}
        </select>
      </div>
      <div className="field">
        <label htmlFor="punch-task">Tâche</label>
        <select id="punch-task" required value={value.taskId} onChange={(event) => onChange({ taskId: event.target.value })}>
          <option value="" disabled>
            Sélectionner…
          </option>
          {tasksForCategory.map((task) => (
            <option key={task.id} value={task.id}>
              {task.label}
            </option>
          ))}
        </select>
      </div>

      {value.projectType === "service" && (
        <>
          <div className="field">
            <label htmlFor="punch-tech-level">Classe facturable</label>
            <select
              id="punch-tech-level"
              required
              value={value.techLevelId ?? ""}
              onChange={(event) => onChange({ techLevelId: event.target.value })}
            >
              <option value="" disabled>
                {eligibleTechLevels.length ? "Sélectionner…" : "Aucune classe assignée — voir Paramètres"}
              </option>
              {eligibleTechLevels.map((techLevel) => (
                <option key={techLevel.id} value={techLevel.id}>
                  {techLevel.label}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="punch-rate-type">Type de temps</label>
            <select
              id="punch-rate-type"
              value={value.rateType ?? "regular"}
              onChange={(event) => onChange({ rateType: event.target.value as RateType })}
            >
              {(Object.keys(RATE_TYPE_LABELS) as RateType[]).map((rateType) => (
                <option key={rateType} value={rateType}>
                  {RATE_TYPE_LABELS[rateType]}
                </option>
              ))}
            </select>
          </div>
          {showRate && (
            <div className="field field-full">
              <label>Tarif appliqué</label>
              <p style={{ margin: 0, color: "var(--gsc-color-muted)" }}>
                {(() => {
                  const rate = selectedTechLevel ? rateForType(selectedTechLevel, value.rateType ?? "regular") : undefined;
                  return rate !== undefined ? `${rate.toFixed(2)} $/h` : "—";
                })()}
              </p>
            </div>
          )}
        </>
      )}
    </>
  );
}
