import { useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { fetchPunchableEmployees } from "../timePunch/api.js";
import { createServiceCall, type CreateServiceCallInput } from "./api.js";

interface ServiceCallFormProps {
  onClose: () => void;
}

const EMPTY: CreateServiceCallInput = {
  newContact: { contactName: "", company: "", contactRole: "", phone: "", email: "" },
  request: "",
  assignedEmployeeId: "",
  scheduledAt: "",
};

/** Toujours un nouveau contact (comme ClientRequestForm) — ensureContact dédoublonne automatiquement côté serveur si le courriel/nom correspond déjà à un contact existant. */
export function ServiceCallForm({ onClose }: ServiceCallFormProps) {
  const queryClient = useQueryClient();
  const employeesQuery = useQuery({ queryKey: ["time-entries", "employees"], queryFn: fetchPunchableEmployees });
  const [form, setForm] = useState<CreateServiceCallInput>(EMPTY);
  const [error, setError] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: () =>
      createServiceCall({
        newContact: {
          contactName: form.newContact.contactName.trim(),
          company: form.newContact.company?.trim() || undefined,
          contactRole: form.newContact.contactRole?.trim() || undefined,
          phone: form.newContact.phone?.trim() || undefined,
          email: form.newContact.email?.trim() || undefined,
        },
        request: form.request.trim(),
        assignedEmployeeId: form.assignedEmployeeId || undefined,
        scheduledAt: form.scheduledAt || undefined,
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["service-calls"] });
      onClose();
    },
    onError: () => setError("Erreur lors de la création — vérifiez les champs et réessayez."),
  });

  function setContact<K extends keyof CreateServiceCallInput["newContact"]>(key: K, value: string) {
    setForm((current) => ({ ...current, newContact: { ...current.newContact, [key]: value } }));
  }

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    mutation.mutate();
  }

  const employees = employeesQuery.data?.employees ?? [];

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(event) => event.stopPropagation()}>
        <div className="modal-header">
          <div>
            <h2>Nouvel appel de service</h2>
            <p className="modal-subtitle">Le contact client sera créé ou mis à jour automatiquement dans le carnet de contacts.</p>
          </div>
          <button type="button" className="modal-close" onClick={onClose} aria-label="Fermer">
            ×
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="modal-body form-grid">
            <div className="field">
              <label htmlFor="sc-company">Entreprise</label>
              <input id="sc-company" value={form.newContact.company} onChange={(event) => setContact("company", event.target.value)} />
            </div>
            <div className="field">
              <label htmlFor="sc-contactName">Nom du contact</label>
              <input
                id="sc-contactName"
                required
                value={form.newContact.contactName}
                onChange={(event) => setContact("contactName", event.target.value)}
              />
            </div>
            <div className="field">
              <label htmlFor="sc-phone">Téléphone</label>
              <input id="sc-phone" value={form.newContact.phone} onChange={(event) => setContact("phone", event.target.value)} />
            </div>
            <div className="field">
              <label htmlFor="sc-email">Courriel</label>
              <input id="sc-email" type="email" value={form.newContact.email} onChange={(event) => setContact("email", event.target.value)} />
            </div>
            <div className="field">
              <label htmlFor="sc-assigned">Employé assigné (facultatif)</label>
              <select
                id="sc-assigned"
                value={form.assignedEmployeeId}
                onChange={(event) => setForm((current) => ({ ...current, assignedEmployeeId: event.target.value }))}
              >
                <option value="">Non assigné</option>
                {employees.map((employee) => (
                  <option key={employee.id} value={employee.id}>
                    {employee.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor="sc-scheduled">Prévu le (facultatif)</label>
              <input
                id="sc-scheduled"
                type="date"
                value={form.scheduledAt}
                onChange={(event) => setForm((current) => ({ ...current, scheduledAt: event.target.value }))}
              />
            </div>
            <div className="field field-full">
              <label htmlFor="sc-request">Description de la demande</label>
              <textarea id="sc-request" required rows={4} value={form.request} onChange={(event) => setForm((current) => ({ ...current, request: event.target.value }))} />
            </div>
          </div>

          {error && <p className="form-error">{error}</p>}

          <div className="modal-footer">
            <button type="button" className="btn btn-secondary" onClick={onClose}>
              Annuler
            </button>
            <button type="submit" className="btn" disabled={mutation.isPending}>
              {mutation.isPending ? "Création…" : "Créer l'appel de service"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
