import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { fetchEmployees, createEmployee, updateEmployee, PERSONA_LABELS, type EmployeeDto, type Persona, type CreateEmployeeInput } from "./api.js";
import { EmployeeDrawer } from "./EmployeeDrawer.js";
import "./settings.css";

const PERSONAS: Persona[] = ["owner", "admin", "boss", "member", "warehouse"];

const emptyCreateDraft: CreateEmployeeInput = { name: "", initials: "", email: "", persona: "member", phone: "", jobTitle: "", costRate: 0 };

/**
 * Utilisateurs et employés — liste simple (accès, coût réel, état).
 * Identifiants complets, classes de service et rôles opérationnels vivent
 * désormais dans la fiche employé (EmployeeDrawer, ouverte par Modifier —
 * 26 août 2026, remplace l'expansion inline dans le tableau). Création =
 * envoie une vraie invitation Supabase par courriel (voir
 * employees/service.ts, createEmployee) — pas testable dans cette session
 * (aucun accès réseau au projet Supabase réel), à vérifier en ligne.
 */
export function EmployeesCard() {
  const queryClient = useQueryClient();
  const employeesQuery = useQuery({ queryKey: ["employees"], queryFn: fetchEmployees });
  const [creating, setCreating] = useState(false);
  const [createDraft, setCreateDraft] = useState<CreateEmployeeInput>(emptyCreateDraft);
  const [error, setError] = useState<string | null>(null);
  const [editingEmployee, setEditingEmployee] = useState<EmployeeDto | null>(null);

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

  const archiveMutation = useMutation({
    mutationFn: ({ id, active }: { id: string; active: boolean }) => updateEmployee(id, { active }),
    onSuccess: invalidate,
  });

  const employees = employeesQuery.data?.employees ?? [];
  const active = employees.filter((employee) => employee.active);
  const archived = employees.filter((employee) => !employee.active);

  const canCreate =
    createDraft.name.trim().length > 0 && createDraft.initials.trim().length > 0 && createDraft.email.trim().length > 0 && !createMutation.isPending;

  function renderRow(employee: EmployeeDto, canEdit: boolean) {
    return (
      <tr key={employee.id} className={employee.active ? "" : "settings-row-inactive"}>
        <td>
          <div>{employee.name}</div>
          <div className="cell-sub">{employee.email}</div>
        </td>
        <td>{PERSONA_LABELS[employee.persona]}</td>
        <td className="num">{employee.costRate !== undefined ? `${employee.costRate.toFixed(2)} $/h` : "—"}</td>
        <td>
          <span className={`badge-pill ${employee.active ? "badge-conforme" : "badge-neutral"}`}>{employee.active ? "Actif" : "Archivé"}</span>
        </td>
        <td style={{ display: "flex", gap: 6 }}>
          {canEdit && (
            <button type="button" className="btn btn-secondary btn-small" onClick={() => setEditingEmployee(employee)}>
              Modifier
            </button>
          )}
          <button
            type="button"
            className="btn btn-secondary btn-small"
            onClick={() => archiveMutation.mutate({ id: employee.id, active: !employee.active })}
          >
            {employee.active ? "Archiver" : "Réactiver"}
          </button>
        </td>
      </tr>
    );
  }

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

      {editingEmployee && <EmployeeDrawer employee={editingEmployee} onClose={() => setEditingEmployee(null)} />}
    </div>
  );
}
