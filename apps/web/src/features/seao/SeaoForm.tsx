import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ApiError } from "../../lib/apiClient.js";
import { ContactSearchField } from "../contacts/ContactAutocomplete.js";
import type { ContactListItemDto } from "../contacts/api.js";
import { createSeaoFile } from "./api.js";

interface SeaoFormProps {
  onClose: () => void;
  onCreated: (id: string) => void;
}

/** Création d'un dossier SEAO (16 septembre 2026) — même patron que ExternalSaleForm.tsx, sans les lignes de pièces (le bordereau se construit une fois les documents analysés, voir SeaoBordereau.tsx). */
export function SeaoForm({ onClose, onCreated }: SeaoFormProps) {
  const queryClient = useQueryClient();
  const [contactName, setContactName] = useState("");
  const [company, setCompany] = useState("");
  const [contactRole, setContactRole] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [referenceNumber, setReferenceNumber] = useState("");
  const [title, setTitle] = useState("");
  const [submissionDeadline, setSubmissionDeadline] = useState("");
  const [error, setError] = useState<string | null>(null);

  const createMutation = useMutation({
    mutationFn: () =>
      createSeaoFile({
        newContact: {
          contactName: contactName.trim(),
          company: company.trim() || undefined,
          contactRole: contactRole.trim() || undefined,
          phone: phone.trim() || undefined,
          email: email.trim() || undefined,
        },
        referenceNumber: referenceNumber.trim() || undefined,
        title: title.trim() || undefined,
        submissionDeadline: submissionDeadline || undefined,
      }),
    onSuccess: ({ id }) => {
      void queryClient.invalidateQueries({ queryKey: ["seao-files"] });
      onCreated(id);
    },
    onError: (err: unknown) => setError(err instanceof ApiError ? err.message : "Une erreur est survenue — réessayez."),
  });

  function applyContact(contact: ContactListItemDto) {
    setContactName(contact.name);
    setCompany(contact.company ?? "");
    setPhone(contact.phone ?? "");
    setEmail(contact.email ?? "");
  }

  const canSubmit = contactName.trim().length > 0 && !createMutation.isPending;

  return (
    <div className="modal-backdrop">
      <div className="modal" style={{ maxWidth: 600 }} onClick={(event) => event.stopPropagation()}>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            if (canSubmit) createMutation.mutate();
          }}
        >
          <div className="modal-header">
            <div>
              <h2>Nouveau dossier SEAO</h2>
              <p className="modal-subtitle">Suivi d'un appel d'offres public — les documents se déposent une fois le dossier créé.</p>
            </div>
            <button type="button" className="modal-close" onClick={onClose} aria-label="Fermer">
              ×
            </button>
          </div>

          <div className="modal-body">
            {error && <p className="form-error">{error}</p>}

            <div className="form-grid">
              <ContactSearchField id="seao-contactName" label="Nom du contact" field="name" value={contactName} onChange={setContactName} onSelect={applyContact} />
              <ContactSearchField id="seao-company" label="Organisme / entreprise" field="company" value={company} onChange={setCompany} onSelect={applyContact} />
              <div className="field">
                <label htmlFor="seao-contactRole">Rôle (facultatif)</label>
                <input id="seao-contactRole" value={contactRole} onChange={(e) => setContactRole(e.target.value)} />
              </div>
              <div className="field">
                <label htmlFor="seao-phone">Téléphone (facultatif)</label>
                <input id="seao-phone" value={phone} onChange={(e) => setPhone(e.target.value)} />
              </div>
              <div className="field">
                <label htmlFor="seao-email">Courriel (facultatif)</label>
                <input id="seao-email" value={email} onChange={(e) => setEmail(e.target.value)} />
              </div>
              <div className="field">
                <label htmlFor="seao-reference">Numéro SEAO (facultatif)</label>
                <input id="seao-reference" value={referenceNumber} onChange={(e) => setReferenceNumber(e.target.value)} placeholder="ex. 2026-1234" />
              </div>
              <div className="field field-full">
                <label htmlFor="seao-title">Objet de l'appel (facultatif)</label>
                <input id="seao-title" value={title} onChange={(e) => setTitle(e.target.value)} />
              </div>
              <div className="field">
                <label htmlFor="seao-deadline">Échéance de soumission (facultatif)</label>
                <input id="seao-deadline" type="date" value={submissionDeadline} onChange={(e) => setSubmissionDeadline(e.target.value)} />
              </div>
            </div>
          </div>

          <div className="modal-footer">
            <button type="button" className="btn btn-secondary" onClick={onClose}>
              Annuler
            </button>
            <button type="submit" className="btn" disabled={!canSubmit}>
              {createMutation.isPending ? "Création…" : "Créer le dossier"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
