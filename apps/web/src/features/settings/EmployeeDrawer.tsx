import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { OptionsDrawer } from "../../components/OptionsDrawer.js";
import { fetchTechLevels, fetchEmployees, updateEmployee, updateEmployeeTechLevels, PERSONA_LABELS, type EmployeeDto, type Persona } from "./api.js";
import "./settings.css";

const PERSONAS: Persona[] = ["owner", "admin", "boss", "member", "warehouse"];

/**
 * Liste fixe des rôles opérationnels (efficacité % — Gantt seulement,
 * jamais le budgétaire/heures/post-mortem) — confirmée avec l'utilisatrice
 * le 26 août 2026, remplace l'ancien champ texte libre pour rester alignée
 * avec les vraies catégories/sous-catégories de Fabrication du budgétaire.
 */
const OPERATIONAL_ROLES = [
  "Conception",
  "Fabrication – Plasma",
  "Fabrication – Pliage",
  "Fabrication – Usinage",
  "Fabrication – Soudage",
  "Fabrication – Peinture",
  "Programmation",
  "Panneau",
  "Assemblage",
  "Installation",
  "Service",
];

interface EditDraft {
  name: string;
  jobTitle: string;
  phone: string;
  costRate: string;
  persona: Persona;
  skillEfficiencies: Record<string, number>;
}

function draftFrom(employee: EmployeeDto): EditDraft {
  return {
    name: employee.name,
    jobTitle: employee.jobTitle ?? "",
    phone: employee.phone ?? "",
    costRate: employee.costRate !== undefined ? String(employee.costRate) : "0",
    persona: employee.persona,
    skillEfficiencies: employee.skillEfficiencies,
  };
}

interface EmployeeDrawerProps {
  employee: EmployeeDto;
  onClose: () => void;
}

/**
 * Fiche employé (26 août 2026, remplace l'expansion inline dans le
 * tableau) — regroupe les champs de base, les classes facturables en
 * service (case à cocher, réutilise updateEmployeeTechLevels tel quel) et
 * les rôles opérationnels (case + % par rôle, réutilise skills[]/
 * skillEfficiencies{} tels quels — seule la liste fixe change, jamais le
 * mécanisme). Lit la liste d'employés en direct (même queryKey que
 * EmployeesCard) pour ne jamais afficher un techLevelIds périmé après un
 * premier basculement de case.
 */
export function EmployeeDrawer({ employee, onClose }: EmployeeDrawerProps) {
  const queryClient = useQueryClient();
  const techLevelsQuery = useQuery({ queryKey: ["tech-levels"], queryFn: fetchTechLevels });
  const employeesQuery = useQuery({ queryKey: ["employees"], queryFn: fetchEmployees });
  const [draft, setDraft] = useState<EditDraft>(() => draftFrom(employee));
  const [error, setError] = useState<string | null>(null);

  const invalidate = () => void queryClient.invalidateQueries({ queryKey: ["employees"] });
  const liveEmployee = employeesQuery.data?.employees.find((e) => e.id === employee.id) ?? employee;

  const saveMutation = useMutation({
    mutationFn: () =>
      updateEmployee(employee.id, {
        name: draft.name.trim(),
        jobTitle: draft.jobTitle.trim() || null,
        phone: draft.phone.trim() || null,
        costRate: Number(draft.costRate),
        persona: draft.persona,
        skills: Object.keys(draft.skillEfficiencies),
        skillEfficiencies: draft.skillEfficiencies,
      }),
    onSuccess: () => {
      setError(null);
      invalidate();
    },
    onError: (err) => setError(err instanceof Error ? err.message : "Erreur à l'enregistrement."),
  });

  const techLevelMutation = useMutation({
    mutationFn: (techLevelIds: string[]) => updateEmployeeTechLevels(employee.id, techLevelIds),
    onSuccess: invalidate,
  });

  const activeTechLevels = (techLevelsQuery.data?.techLevels ?? []).filter((t) => t.active);

  function toggleTechLevel(techLevelId: string) {
    const current = liveEmployee.techLevelIds;
    const next = current.includes(techLevelId) ? current.filter((id) => id !== techLevelId) : [...current, techLevelId];
    techLevelMutation.mutate(next);
  }

  function toggleRole(role: string) {
    setDraft((current) => {
      const next = { ...current.skillEfficiencies };
      if (role in next) delete next[role];
      else next[role] = 100;
      return { ...current, skillEfficiencies: next };
    });
  }

  function setRolePct(role: string, pct: number) {
    setDraft((current) => ({ ...current, skillEfficiencies: { ...current.skillEfficiencies, [role]: pct } }));
  }

  const valid = draft.name.trim().length > 0;

  return (
    <OptionsDrawer eyebrow="Fiche employé" title={employee.name} onClose={onClose}>
      <div className="form-grid">
        <div className="field">
          <label>Nom</label>
          <input value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} />
        </div>
        <div className="field">
          <label>Rôle (accès)</label>
          <select value={draft.persona} onChange={(event) => setDraft({ ...draft, persona: event.target.value as Persona })}>
            {PERSONAS.map((persona) => (
              <option key={persona} value={persona}>
                {PERSONA_LABELS[persona]}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label>Titre / poste</label>
          <input value={draft.jobTitle} onChange={(event) => setDraft({ ...draft, jobTitle: event.target.value })} />
        </div>
        <div className="field">
          <label>Téléphone</label>
          <input value={draft.phone} onChange={(event) => setDraft({ ...draft, phone: event.target.value })} />
        </div>
        <div className="field">
          <label>Coût réel ($/h)</label>
          <input type="number" min={0} step="0.01" value={draft.costRate} onChange={(event) => setDraft({ ...draft, costRate: event.target.value })} />
        </div>
      </div>

      <h3 style={{ fontSize: 14, marginTop: 20, marginBottom: 6 }}>Classes facturables en service</h3>
      <p className="cell-sub" style={{ marginBottom: 8 }}>Utilisées au punch sur un call de service — plusieurs choix permis.</p>
      {activeTechLevels.length === 0 ? (
        <p className="cell-sub">Aucune classe active — voir Classes de service ci-dessus.</p>
      ) : (
        <div className="role-grid-list">
          {activeTechLevels.map((techLevel) => (
            <label key={techLevel.id} className="role-grid-row">
              <input
                type="checkbox"
                checked={liveEmployee.techLevelIds.includes(techLevel.id)}
                disabled={techLevelMutation.isPending}
                onChange={() => toggleTechLevel(techLevel.id)}
              />
              <span className="role-grid-label">{techLevel.label}</span>
            </label>
          ))}
        </div>
      )}

      <h3 style={{ fontSize: 14, marginTop: 20, marginBottom: 6 }}>Rôles opérationnels</h3>
      <p className="cell-sub" style={{ marginBottom: 8 }}>Efficacité % — Gantt seulement, jamais le budgétaire/heures/post-mortem.</p>
      <div className="role-grid-list">
        {OPERATIONAL_ROLES.map((role) => {
          const checked = role in draft.skillEfficiencies;
          return (
            <label key={role} className="role-grid-row">
              <input type="checkbox" checked={checked} onChange={() => toggleRole(role)} />
              <span className="role-grid-label">{role}</span>
              {checked && (
                <span className="role-grid-pct">
                  <input
                    type="number"
                    min={0}
                    max={100}
                    value={draft.skillEfficiencies[role]}
                    onChange={(event) => setRolePct(role, Number(event.target.value))}
                  />
                  %
                </span>
              )}
            </label>
          );
        })}
      </div>

      {error && (
        <p className="form-error" style={{ marginTop: 12 }}>
          {error}
        </p>
      )}

      <div style={{ display: "flex", gap: 8, marginTop: 20 }}>
        <button type="button" className="btn" disabled={!valid || saveMutation.isPending} onClick={() => saveMutation.mutate()}>
          {saveMutation.isPending ? "…" : "Enregistrer"}
        </button>
        <button type="button" className="btn btn-secondary" onClick={onClose}>
          Fermer
        </button>
      </div>
    </OptionsDrawer>
  );
}
