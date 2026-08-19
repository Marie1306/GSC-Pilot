import { useState, type FormEvent } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { createContact, updateContact, type ContactListItemDto } from "./api.js";

interface ContactFormProps {
  onClose: () => void;
  /** Présent = modification d'un contact existant plutôt que création. */
  contact?: ContactListItemDto;
}

interface FormState {
  type: string;
  name: string;
  company: string;
  role: string;
  email: string;
  phone: string;
  categories: string;
}

function toFormState(contact?: ContactListItemDto): FormState {
  return {
    type: contact?.type ?? "Client",
    name: contact?.name ?? "",
    company: contact?.company ?? "",
    role: contact?.role ?? "",
    email: contact?.email ?? "",
    phone: contact?.phone ?? "",
    categories: contact?.categories.join(", ") ?? "",
  };
}

/** Ajout manuel — surtout pour les contacts jamais créés par ensureContact (ex. fournisseurs). */
export function ContactForm({ onClose, contact }: ContactFormProps) {
  const queryClient = useQueryClient();
  const [form, setForm] = useState<FormState>(() => toFormState(contact));
  const [error, setError] = useState<string | null>(null);

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ["contacts"] });
    if (contact) void queryClient.invalidateQueries({ queryKey: ["contact", contact.id] });
  };

  const mutation = useMutation({
    mutationFn: () => {
      const input = {
        type: form.type,
        name: form.name.trim(),
        company: form.company.trim() || null,
        role: form.role.trim() || null,
        email: form.email.trim() || null,
        phone: form.phone.trim() || null,
        categories: form.categories
          .split(",")
          .map((category) => category.trim())
          .filter(Boolean),
      };
      return contact ? updateContact(contact.id, input) : createContact(input);
    },
    onSuccess: () => {
      invalidate();
      onClose();
    },
    onError: () => setError("Erreur — vérifiez les champs et réessayez."),
  });

  function set<K extends keyof FormState>(key: K, value: string) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    mutation.mutate();
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(event) => event.stopPropagation()}>
        <div className="modal-header">
          <div>
            <h2>{contact ? "Modifier le contact" : "Nouveau contact"}</h2>
            <p className="modal-subtitle">Pour les contacts qui ne s'ajoutent pas déjà automatiquement (ex. fournisseurs).</p>
          </div>
          <button type="button" className="modal-close" onClick={onClose} aria-label="Fermer">
            ×
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="modal-body form-grid">
            <div className="field">
              <label htmlFor="ct-type">Type</label>
              <select id="ct-type" value={form.type} onChange={(event) => set("type", event.target.value)}>
                <option value="Client">Client</option>
                <option value="Fournisseur">Fournisseur</option>
              </select>
            </div>
            <div className="field">
              <label htmlFor="ct-name">Nom</label>
              <input id="ct-name" required value={form.name} onChange={(event) => set("name", event.target.value)} />
            </div>
            <div className="field">
              <label htmlFor="ct-company">Entreprise</label>
              <input id="ct-company" value={form.company} onChange={(event) => set("company", event.target.value)} />
            </div>
            <div className="field">
              <label htmlFor="ct-role">Rôle</label>
              <input id="ct-role" placeholder="Ex. Contact client" value={form.role} onChange={(event) => set("role", event.target.value)} />
            </div>
            <div className="field">
              <label htmlFor="ct-phone">Téléphone</label>
              <input id="ct-phone" value={form.phone} onChange={(event) => set("phone", event.target.value)} />
            </div>
            <div className="field">
              <label htmlFor="ct-email">Courriel</label>
              <input id="ct-email" type="email" value={form.email} onChange={(event) => set("email", event.target.value)} />
            </div>
            <div className="field field-full">
              <label htmlFor="ct-categories">Catégories (séparées par des virgules)</label>
              <input
                id="ct-categories"
                placeholder="Ex. Fournisseur, Pneumatique"
                value={form.categories}
                onChange={(event) => set("categories", event.target.value)}
              />
            </div>
          </div>

          {error && <p className="form-error">{error}</p>}

          <div className="modal-footer">
            <button type="button" className="btn btn-secondary" onClick={onClose}>
              Annuler
            </button>
            <button type="submit" className="btn" disabled={mutation.isPending}>
              {mutation.isPending ? "Enregistrement…" : contact ? "Enregistrer les modifications" : "Créer le contact"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
