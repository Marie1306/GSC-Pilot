import { useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { fetchPunchableEmployees } from "../timePunch/api.js";
import { ContactSearchField } from "../contacts/ContactAutocomplete.js";
import type { ContactListItemDto } from "../contacts/api.js";
import { createServiceCall, type CreateServiceCallInput } from "./api.js";

/** Conversion directe d'une demande client de type "Call de service" (27 août 2026) — voir ClientRequestOptionsMenu. */
export interface ServiceCallPrefillFromRequest {
  clientRequestId: string;
  requestDisplayId: string;
  contactName: string;
  company?: string;
  contactRole?: string;
  phone?: string;
  email?: string;
  address?: string;
  summary: string;
}

/**
 * Call lié à un projet, sous-garantie (27 août 2026) — voir ProjectOptionsMenu.
 * Pas de champ address : contrairement à ClientRequest, Project n'a pas
 * d'adresse dénormalisée (seulement contactId) — le technicien saisit
 * l'adresse du site directement si elle diffère de celle du contact.
 */
export interface ServiceCallPrefillFromProject {
  projectId: string;
  projectLabel: string;
  contactName: string;
  company?: string;
  contactRole?: string;
  phone?: string;
  email?: string;
}

interface ServiceCallFormProps {
  onClose: () => void;
  prefillFromRequest?: ServiceCallPrefillFromRequest;
  prefillFromProject?: ServiceCallPrefillFromProject;
}

const EMPTY: CreateServiceCallInput = {
  newContact: { contactName: "", company: "", contactRole: "", phone: "", email: "" },
  request: "",
  address: "",
  assignedEmployeeIds: [],
  scheduledAt: "",
};

function initialForm(prefillFromRequest?: ServiceCallPrefillFromRequest, prefillFromProject?: ServiceCallPrefillFromProject): CreateServiceCallInput {
  if (prefillFromRequest) {
    return {
      newContact: {
        contactName: prefillFromRequest.contactName,
        company: prefillFromRequest.company ?? "",
        contactRole: prefillFromRequest.contactRole ?? "",
        phone: prefillFromRequest.phone ?? "",
        email: prefillFromRequest.email ?? "",
      },
      request: prefillFromRequest.summary,
      address: prefillFromRequest.address ?? "",
      assignedEmployeeIds: [],
      scheduledAt: "",
    };
  }
  if (prefillFromProject) {
    return {
      newContact: {
        contactName: prefillFromProject.contactName,
        company: prefillFromProject.company ?? "",
        contactRole: prefillFromProject.contactRole ?? "",
        phone: prefillFromProject.phone ?? "",
        email: prefillFromProject.email ?? "",
      },
      request: "",
      address: "",
      assignedEmployeeIds: [],
      scheduledAt: "",
    };
  }
  return EMPTY;
}

/** Toujours un nouveau contact (comme ClientRequestForm) — ensureContact dédoublonne automatiquement côté serveur si le courriel/nom correspond déjà à un contact existant, y compris en conversion (prefillFromRequest) : jamais un contactId réutilisé directement, même logique partout. */
export function ServiceCallForm({ onClose, prefillFromRequest, prefillFromProject }: ServiceCallFormProps) {
  const queryClient = useQueryClient();
  const employeesQuery = useQuery({ queryKey: ["time-entries", "employees"], queryFn: fetchPunchableEmployees });
  const [form, setForm] = useState<CreateServiceCallInput>(() => initialForm(prefillFromRequest, prefillFromProject));
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
        address: form.address?.trim() || undefined,
        assignedEmployeeIds: form.assignedEmployeeIds,
        scheduledAt: form.scheduledAt || undefined,
        clientRequestId: prefillFromRequest?.clientRequestId,
        projectId: prefillFromProject?.projectId,
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

  /** Sélection d'une suggestion — remplit les coordonnées comme si on les retapait depuis la fiche contact. */
  function applyContact(contact: ContactListItemDto) {
    setForm((current) => ({
      ...current,
      newContact: {
        contactName: contact.name,
        company: contact.company ?? "",
        contactRole: contact.role ?? "",
        phone: contact.phone ?? "",
        email: contact.email ?? "",
      },
    }));
  }

  function toggleEmployee(employeeId: string) {
    setForm((current) => {
      const ids = current.assignedEmployeeIds ?? [];
      return { ...current, assignedEmployeeIds: ids.includes(employeeId) ? ids.filter((id) => id !== employeeId) : [...ids, employeeId] };
    });
  }

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    mutation.mutate();
  }

  const employees = employeesQuery.data?.employees ?? [];

  return (
    <div className="modal-backdrop">
      <div className="modal">
        <div className="modal-header">
          <div>
            <h2>{prefillFromRequest ? "Convertir en call de service" : prefillFromProject ? "Créer un call lié" : "Nouvel appel de service"}</h2>
            <p className="modal-subtitle">
              {prefillFromRequest
                ? `Pré-rempli depuis la demande ${prefillFromRequest.requestDisplayId} — vérifiez avant de créer.`
                : prefillFromProject
                  ? `Lié au projet ${prefillFromProject.projectLabel} — les frais (achats et heures punchées) se soustrairont du projet, mais ce call ne sera jamais facturé séparément.`
                  : "Le contact client sera créé ou mis à jour automatiquement dans le carnet de contacts."}
            </p>
          </div>
          <button type="button" className="modal-close" onClick={onClose} aria-label="Fermer">
            ×
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="modal-body form-grid">
            <ContactSearchField
              id="sc-company"
              label="Entreprise"
              field="company"
              value={form.newContact.company ?? ""}
              onChange={(value) => setContact("company", value)}
              onSelect={applyContact}
            />
            <ContactSearchField
              id="sc-contactName"
              label="Nom du contact"
              field="name"
              required
              value={form.newContact.contactName}
              onChange={(value) => setContact("contactName", value)}
              onSelect={applyContact}
            />
            <div className="field">
              <label htmlFor="sc-phone">Téléphone</label>
              <input id="sc-phone" value={form.newContact.phone} onChange={(event) => setContact("phone", event.target.value)} />
            </div>
            <div className="field">
              <label htmlFor="sc-email">Courriel</label>
              <input id="sc-email" type="email" value={form.newContact.email} onChange={(event) => setContact("email", event.target.value)} />
            </div>
            <div className="field field-full">
              <label htmlFor="sc-address">Adresse (facultative)</label>
              <input
                id="sc-address"
                value={form.address ?? ""}
                onChange={(event) => setForm((current) => ({ ...current, address: event.target.value }))}
              />
            </div>
            <div className="field field-full">
              <label>Techniciens assignés (facultatif, plusieurs possibles)</label>
              <div className="service-call-employee-checklist">
                {employees.map((employee) => (
                  <label key={employee.id}>
                    <input
                      type="checkbox"
                      checked={(form.assignedEmployeeIds ?? []).includes(employee.id)}
                      onChange={() => toggleEmployee(employee.id)}
                    />
                    {employee.name}
                  </label>
                ))}
              </div>
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
              {mutation.isPending ? "Création…" : prefillFromRequest || prefillFromProject ? "Créer le call de service" : "Créer l'appel de service"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
