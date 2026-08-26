import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  fetchEmployees,
  createEmployee,
  updateEmployee,
  PERSONA_LABELS,
  type EmployeeDto,
  type Persona,
  type CreateEmployeeInput,
} from "./api.js";
import "./settings.css";

const PERSONAS: Persona[] = ["owner", "admin", "boss", "member", "warehouse"];

interface EditDraft {
  name: string;
  jobTitle: string;
  phone: string;
  costRate: string;
  persona: Persona;
  skills: string[];
  skillEfficiencies: Record<string, number>;
  newSkill: string;
}

function draftFrom(employee: EmployeeDto): EditDraft {
  return {
    name: employee.name,
    jobTitle: employee.jobTitle ?? "",
    phone: employee.phone ?? "",
    costRate: employee.costRate !== undefined ? String(employee.costRate) : "0",
    persona: employee.persona,
    skills: employee.skills,
    skillEfficiencies: employee.skillEfficiencies,
    newSkill: "",
  };
}

const emptyCreateDraft: CreateEmployeeInput = { name: "", initials: "", email: "", persona: "member", phone: "", jobTitle: "", costRate: 0 };

/**
 * Utilisateurs et employés — accès, rôles opérationnels (skills, texte
 * libre), classes de service (voir TechLevelsCard, assignation séparée),
 * compétences/efficacité (skillEfficiencies — Gantt seulement, jamais le
 * budgétaire/heures/post-mortem, voir schema.prisma) et coût réel.
 * Création = envoie une vraie invitation Supabase par courriel (voir
 * employees/service.ts, createEmployee) — pas testable dans cette session
 * (aucun accès réseau au projet Supabase réel), à vérifier en ligne.
 */
export function EmployeesCard() {
  const queryClient = useQueryClient();
  const employeesQuery = useQuery({ queryKey: ["employees"], queryFn: fetchEmployees });
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<EditDraft | null>(null);
  const [creating, setCreating] = useState(false);
  const [createDraft, setCreateDraft] = useState<CreateEmployeeInput>(emptyCreateDraft);
  const [error, setError] = useState<string | null>(null);

  const invalidate = () => void queryClient.invalidateQueries({ queryKey: ["employees"] });

  const createMutation = useMutation({
    mutationFn: () => createEmployee({ ...createDraft, name: createDraft.name.trim(), initials: createDraft.initials.trim(), email: createDraft.email.trim() }),
    onSuccess: () => {
      setCreating(false);
      setCreateDraft(emptyCreateDraft);
      setError(null);
      invalidate();
    },
    onError: (err) => setError(err instanceof Error ? err.message : "Erreur à la création."),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: Parameters<typeof updateEmployee>[1] }) => updateEmployee(id, patch),
    onSuccess: () => {
      setEditingId(null);
      setDraft(null);
      setError(null);
      invalidate();
    },
    onError: (err) => setError(err instanceof Error ? err.message : "Erreur à l'enregistrement."),
  });

  const employees = employeesQuery.data?.employees ?? [];
  const active = employees.filter((employee) => employee.active);
  const archived = employees.filter((employee) => !employee.active);

  function openEdit(employee: EmployeeDto) {
    setEditingId(employee.id);
    setDraft(draftFrom(employee));
  }

  function saveEdit(id: string) {
    if (!draft) return;
    updateMutation.mutate({
      id,
      patch: {
        name: draft.name.trim(),
        jobTitle: draft.jobTitle.trim() || null,
        phone: draft.phone.trim() || null,
        costRate: Number(draft.costRate),
        persona: draft.persona,
        skills: draft.skills,
        skillEfficiencies: draft.skillEfficiencies,
      },
    });
  }

  function addSkill() {
    if (!draft || !draft.newSkill.trim()) return;
    const skill = draft.newSkill.trim();
    if (draft.skills.includes(skill)) return;
    setDraft({ ...draft, skills: [...draft.skills, skill], skillEfficiencies: { ...draft.skillEfficiencies, [skill]: 100 }, newSkill: "" });
  }
  function removeSkill(skill: string) {
    if (!draft) return;
    const { [skill]: _removed, ...rest } = draft.skillEfficiencies;
    setDraft({ ...draft, skills: draft.skills.filter((s) => s !== skill), skillEfficiencies: rest });
  }

  function renderRow(employee: EmployeeDto, canEdit: boolean) {
    const isEditing = editingId === employee.id;
    return (
      <>
        <tr key={employee.id} className={employee.active ? "" : "settings-row-inactive"}>
          <td>
            <div>{employee.name}</div>
            <div className="cell-sub">{employee.email}</div>
          </td>
          <td>{PERSONA_LABELS[employee.persona]}</td>
          <td>{employee.skills.length > 0 ? employee.skills.join(" · ") : "—"}</td>
          <td>
            {employee.skills.length > 0
              ? employee.skills.map((skill) => `${skill} ${employee.skillEfficiencies[skill] ?? 0} %`).join(" · ")
              : "—"}
          </td>
          <td className="num">{employee.costRate !== undefined ? `${employee.costRate.toFixed(2)} $/h` : "—"}</td>
          <td>
            <span className={`badge-pill ${employee.active ? "badge-conforme" : "badge-neutral"}`}>{employee.active ? "Actif" : "Archivé"}</span>
          </td>
          <td style={{ display: "flex", gap: 6 }}>
            {canEdit && (
              <button type="button" className="btn btn-secondary btn-small" onClick={() => (isEditing ? setEditingId(null) : openEdit(employee))}>
                {isEditing ? "Annuler" : "Modifier"}
              </button>
            )}
            <button
              type="button"
              className="btn btn-secondary btn-small"
              onClick={() => updateMutation.mutate({ id: employee.id, patch: { active: !employee.active } })}
            >
              {employee.active ? "Archiver" : "Réactiver"}
            </button>
          </td>
        </tr>
        {isEditing && draft && (
          <tr>
            <td colSpan={7}>
              <div className="form-grid" style={{ margin: "8px 0" }}>
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
                  <input
                    type="number"
                    min={0}
                    step="0.01"
                    value={draft.costRate}
                    onChange={(event) => setDraft({ ...draft, costRate: event.target.value })}
                  />
                </div>
                <div className="field field-full">
                  <label>Rôles opérationnels / compétences (efficacité % — Gantt seulement)</label>
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 8 }}>
                    {draft.skills.map((skill) => (
                      <div
                        key={skill}
                        style={{ display: "flex", alignItems: "center", gap: 4, border: "1px solid var(--gsc-color-line-strong)", borderRadius: 999, padding: "2px 8px" }}
                      >
                        <span style={{ fontSize: 13 }}>{skill}</span>
                        <input
                          type="number"
                          min={0}
                          max={100}
                          style={{ width: 50, minHeight: "unset", padding: "2px 4px" }}
                          value={draft.skillEfficiencies[skill] ?? 100}
                          onChange={(event) =>
                            setDraft({ ...draft, skillEfficiencies: { ...draft.skillEfficiencies, [skill]: Number(event.target.value) } })
                          }
                        />
                        <span style={{ fontSize: 12 }}>%</span>
                        <button
                          type="button"
                          onClick={() => removeSkill(skill)}
                          aria-label={`Retirer ${skill}`}
                          style={{ border: "none", background: "none", cursor: "pointer", fontSize: 14, lineHeight: 1, padding: 0, color: "var(--gsc-color-muted)" }}
                        >
                          ×
                        </button>
                      </div>
                    ))}
                  </div>
                  <div style={{ display: "flex", gap: 6 }}>
                    <input
                      placeholder="ex. Fabrication, Technicien senior…"
                      style={{ maxWidth: 220 }}
                      value={draft.newSkill}
                      onChange={(event) => setDraft({ ...draft, newSkill: event.target.value })}
                      onKeyDown={(event) => {
                        if (event.key === "Enter") {
                          event.preventDefault();
                          addSkill();
                        }
                      }}
                    />
                    <button type="button" className="btn btn-secondary btn-small" onClick={addSkill}>
                      + Ajouter
                    </button>
                  </div>
                </div>
                <div className="field field-full" style={{ display: "flex", gap: 8 }}>
                  <button type="button" className="btn btn-small" disabled={updateMutation.isPending} onClick={() => saveEdit(employee.id)}>
                    {updateMutation.isPending ? "…" : "Enregistrer"}
                  </button>
                  <button type="button" className="btn btn-secondary btn-small" onClick={() => setEditingId(null)}>
                    Annuler
                  </button>
                </div>
              </div>
            </td>
          </tr>
        )}
      </>
    );
  }

  const canCreate =
    createDraft.name.trim().length > 0 && createDraft.initials.trim().length > 0 && createDraft.email.trim().length > 0 && !createMutation.isPending;

  return (
    <div className="card">
      <div className="card-band-header">
        <div>
          <h3>Utilisateurs et employés actifs</h3>
          <p className="modal-subtitle">Identifiants, accès, rôles, classes facturables, compétences et coût réel.</p>
        </div>
        <button type="button" className="btn" onClick={() => setCreating((current) => !current)}>
          {creating ? "Annuler" : "+ Ajouter"}
        </button>
      </div>

      {creating && (
        <div className="form-grid" style={{ margin: "12px 0", padding: 12, border: "1px solid var(--gsc-color-line-strong)", borderRadius: "var(--gsc-radius-base)" }}>
          <div className="field">
            <label>Nom</label>
            <input value={createDraft.name} onChange={(event) => setCreateDraft({ ...createDraft, name: event.target.value })} />
          </div>
          <div className="field">
            <label>Initiales</label>
            <input value={createDraft.initials} onChange={(event) => setCreateDraft({ ...createDraft, initials: event.target.value })} />
          </div>
          <div className="field">
            <label>Courriel</label>
            <input type="email" value={createDraft.email} onChange={(event) => setCreateDraft({ ...createDraft, email: event.target.value })} />
          </div>
          <div className="field">
            <label>Rôle (accès)</label>
            <select value={createDraft.persona} onChange={(event) => setCreateDraft({ ...createDraft, persona: event.target.value as Persona })}>
              {PERSONAS.map((persona) => (
                <option key={persona} value={persona}>
                  {PERSONA_LABELS[persona]}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label>Titre / poste (facultatif)</label>
            <input value={createDraft.jobTitle ?? ""} onChange={(event) => setCreateDraft({ ...createDraft, jobTitle: event.target.value })} />
          </div>
          <div className="field">
            <label>Coût réel ($/h)</label>
            <input
              type="number"
              min={0}
              step="0.01"
              value={createDraft.costRate ?? 0}
              onChange={(event) => setCreateDraft({ ...createDraft, costRate: Number(event.target.value) })}
            />
          </div>
          <div className="field field-full">
            <p style={{ fontSize: 12, color: "var(--gsc-color-muted)", margin: 0 }}>
              Une invitation sera envoyée par courriel (Supabase) pour que la personne crée son mot de passe.
            </p>
            <button type="button" className="btn" disabled={!canCreate} onClick={() => createMutation.mutate()} style={{ marginTop: 8 }}>
              {createMutation.isPending ? "Envoi de l'invitation…" : "Créer et inviter"}
            </button>
          </div>
        </div>
      )}

      {error && <p className="form-error">{error}</p>}

      <div style={{ overflowX: "auto" }}>
        <table className="settings-table">
          <thead>
            <tr>
              <th>Utilisateur</th>
              <th>Accès</th>
              <th>Rôles opérationnels</th>
              <th>Compétences / efficacité</th>
              <th className="num">Coût réel</th>
              <th>État</th>
              <th></th>
            </tr>
          </thead>
          <tbody>{active.map((employee) => renderRow(employee, true))}</tbody>
        </table>
      </div>

      {archived.length > 0 && (
        <div style={{ marginTop: 24 }}>
          <h3 style={{ fontSize: 14 }}>Utilisateurs et employés archivés</h3>
          <p style={{ color: "var(--gsc-color-muted)", fontSize: 13, marginTop: -6 }}>
            Consultation seulement. Un utilisateur archivé ne peut plus se connecter ni être sélectionné dans les opérations.
          </p>
          <div style={{ overflowX: "auto" }}>
            <table className="settings-table">
              <thead>
                <tr>
                  <th>Utilisateur</th>
                  <th>Accès</th>
                  <th>Rôles opérationnels</th>
                  <th>Compétences / efficacité</th>
                  <th className="num">Coût réel</th>
                  <th>État</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>{archived.map((employee) => renderRow(employee, false))}</tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
