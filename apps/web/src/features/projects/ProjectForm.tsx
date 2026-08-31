import { useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ApiError } from "../../lib/apiClient.js";
import { ContactSearchField } from "../contacts/ContactAutocomplete.js";
import type { ContactListItemDto } from "../contacts/api.js";
import { createProject, fetchNextProjectNumber, type CreateProjectInput } from "./api.js";

/** Conversion directe d'une demande client en projet (31 août 2026) — voir ClientRequestOptionsMenu. */
export interface ProjectPrefillFromRequest {
  clientRequestId: string;
  requestDisplayId: string;
  contactName: string;
  company?: string;
  contactRole?: string;
  phone?: string;
  email?: string;
}

interface ProjectFormProps {
  onClose: () => void;
  onCreated: (id: string) => void;
  prefillFromRequest?: ProjectPrefillFromRequest;
}

function initialForm(prefillFromRequest?: ProjectPrefillFromRequest): CreateProjectInput {
  if (prefillFromRequest) {
    return {
      name: "",
      projectNumber: "",
      newContact: {
        contactName: prefillFromRequest.contactName,
        company: prefillFromRequest.company ?? "",
        contactRole: prefillFromRequest.contactRole ?? "",
        phone: prefillFromRequest.phone ?? "",
        email: prefillFromRequest.email ?? "",
      },
    };
  }
  return { name: "", projectNumber: "", newContact: { contactName: "", company: "", contactRole: "", phone: "", email: "" } };
}

/**
 * Création directe, hors conversion d'un budgétaire (spécification confirmée,
 * section « Projets — création directe », 9 août 2026) : bouton et
 * formulaire visibles seulement pour Direction/Propriétaire côté liste
 * (ProjectList) — même blocage refait ici à la soumission par le serveur
 * (canCreateProjectDirectly), jamais un seul des deux (le code v19 d'origine
 * n'avait ni l'un ni l'autre, corrigé dans la spécification).
 *
 * prefillFromRequest (31 août 2026, conversion depuis Options d'une demande
 * client) — même patron que ServiceCallForm.tsx : contact préaffiché, "name"
 * (nom du projet, distinct du nom du contact) toujours saisi manuellement,
 * jamais copié depuis la demande.
 */
export function ProjectForm({ onClose, onCreated, prefillFromRequest }: ProjectFormProps) {
  const queryClient = useQueryClient();
  const nextNumberQuery = useQuery({ queryKey: ["next-project-number"], queryFn: fetchNextProjectNumber });
  const [form, setForm] = useState<CreateProjectInput>(() => initialForm(prefillFromRequest));
  const [numberOverride, setNumberOverride] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const projectNumber = numberOverride ?? String(nextNumberQuery.data?.nextProjectNumber ?? "");

  const mutation = useMutation({
    mutationFn: () =>
      createProject({
        name: form.name.trim(),
        projectNumber: projectNumber.trim() || undefined,
        newContact: {
          contactName: form.newContact.contactName.trim(),
          company: form.newContact.company?.trim() || undefined,
          contactRole: form.newContact.contactRole?.trim() || undefined,
          phone: form.newContact.phone?.trim() || undefined,
          email: form.newContact.email?.trim() || undefined,
        },
        clientRequestId: prefillFromRequest?.clientRequestId,
      }),
    onSuccess: (result) => {
      void queryClient.invalidateQueries({ queryKey: ["projects"] });
      if (prefillFromRequest) {
        void queryClient.invalidateQueries({ queryKey: ["client-request", prefillFromRequest.clientRequestId] });
        void queryClient.invalidateQueries({ queryKey: ["client-requests"] });
      }
      onCreated(result.id);
    },
    onError: (err) => setError(err instanceof ApiError ? err.message : "Erreur lors de la création — vérifiez les champs et réessayez."),
  });

  function setContact<K extends keyof CreateProjectInput["newContact"]>(key: K, value: string) {
    setForm((current) => ({ ...current, newContact: { ...current.newContact, [key]: value } }));
  }

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

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    mutation.mutate();
  }

  return (
    <div className="modal-backdrop">
      <div className="modal">
        <div className="modal-header">
          <div>
            <h2>{prefillFromRequest ? "Convertir en projet" : "Nouveau projet"}</h2>
            <p className="modal-subtitle">
              {prefillFromRequest
                ? `Pré-rempli depuis la demande ${prefillFromRequest.requestDisplayId} — vérifiez avant de créer.`
                : "Création directe, sans passer par un budgétaire. Le contact client sera créé ou mis à jour automatiquement dans le carnet de contacts."}
            </p>
          </div>
          <button type="button" className="modal-close" onClick={onClose} aria-label="Fermer">
            ×
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="modal-body form-grid">
            <div className="field">
              <label htmlFor="pj-name">Nom du projet</label>
              <input id="pj-name" required autoFocus value={form.name} onChange={(e) => setForm((current) => ({ ...current, name: e.target.value }))} />
            </div>
            <div className="field">
              <label htmlFor="pj-number">Numéro</label>
              <input
                id="pj-number"
                value={projectNumber}
                onChange={(e) => setNumberOverride(e.target.value)}
                title="Préaffiché automatiquement (plus grand numéro + 1) — modifiable pour reprendre un numéro hérité de l'ancien système."
              />
            </div>

            <ContactSearchField
              id="pj-company"
              label="Entreprise"
              field="company"
              value={form.newContact.company ?? ""}
              onChange={(value) => setContact("company", value)}
              onSelect={applyContact}
            />
            <ContactSearchField
              id="pj-contactName"
              label="Nom du contact"
              field="name"
              required
              value={form.newContact.contactName}
              onChange={(value) => setContact("contactName", value)}
              onSelect={applyContact}
            />
            <div className="field">
              <label htmlFor="pj-contactRole">Rôle du contact (facultatif)</label>
              <input id="pj-contactRole" value={form.newContact.contactRole} onChange={(e) => setContact("contactRole", e.target.value)} />
            </div>
            <div className="field">
              <label htmlFor="pj-phone">Téléphone</label>
              <input id="pj-phone" value={form.newContact.phone} onChange={(e) => setContact("phone", e.target.value)} />
            </div>
            <div className="field">
              <label htmlFor="pj-email">Courriel</label>
              <input id="pj-email" type="email" value={form.newContact.email} onChange={(e) => setContact("email", e.target.value)} />
            </div>
          </div>

          {error && <p className="form-error">{error}</p>}

          <div className="modal-footer">
            <button type="button" className="btn btn-secondary" onClick={onClose}>
              Annuler
            </button>
            <button type="submit" className="btn" disabled={mutation.isPending || !form.name.trim() || !form.newContact.contactName.trim()}>
              {mutation.isPending ? "Création…" : "Créer le projet"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
