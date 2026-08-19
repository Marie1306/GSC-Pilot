import { useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ContactSearchField } from "../contacts/ContactAutocomplete.js";
import type { ContactListItemDto } from "../contacts/api.js";
import {
  fetchSalesChannels,
  createClientRequest,
  REQUEST_TYPE_LABELS,
  URGENCY_LABELS,
  type RequestType,
  type Urgency,
  type CreateClientRequestInput,
} from "./api.js";

interface ClientRequestFormProps {
  onClose: () => void;
}

const EMPTY: CreateClientRequestInput = {
  company: "",
  contactName: "",
  contactRole: "",
  phone: "",
  email: "",
  address: "",
  requestType: "project",
  urgency: "normal",
  salesChannelId: "",
  sourceDetail: "",
  nextFollowUp: "",
  summary: "",
};

/**
 * Champs et libellés vérifiés directement dans le formulaire du prototype
 * v19 (docs/handoff/04-reference-v19), pas devinés — voir spécification,
 * section « Demandes clients », confirmée le 12 août 2026.
 */
export function ClientRequestForm({ onClose }: ClientRequestFormProps) {
  const queryClient = useQueryClient();
  const channelsQuery = useQuery({ queryKey: ["sales-channels"], queryFn: fetchSalesChannels });
  const [form, setForm] = useState<CreateClientRequestInput>(EMPTY);
  const [error, setError] = useState<string | null>(null);

  const mutation = useMutation({
    // Les champs facultatifs vides restent des chaînes vides dans le
    // formulaire (contrôlé), mais l'API doit les recevoir absents plutôt
    // que "" — surtout nextFollowUp, dont le format ISO rejette une
    // chaîne vide même si le champ est facultatif (z.iso.date().optional()
    // n'accepte pas "" comme "absent").
    mutationFn: () =>
      createClientRequest({
        ...form,
        contactRole: form.contactRole?.trim() || undefined,
        address: form.address?.trim() || undefined,
        sourceDetail: form.sourceDetail?.trim() || undefined,
        nextFollowUp: form.nextFollowUp?.trim() || undefined,
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["client-requests"] });
      onClose();
    },
    onError: () => setError("Erreur lors de la création — vérifiez les champs et réessayez."),
  });

  function set<K extends keyof CreateClientRequestInput>(key: K, value: CreateClientRequestInput[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  /** Sélection d'une suggestion — remplit les coordonnées comme si on les retapait depuis la fiche contact. */
  function applyContact(contact: ContactListItemDto) {
    setForm((current) => ({
      ...current,
      company: contact.company ?? "",
      contactName: contact.name,
      contactRole: contact.role ?? "",
      phone: contact.phone ?? "",
      email: contact.email ?? "",
    }));
  }

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    mutation.mutate();
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal client-request-modal" onClick={(event) => event.stopPropagation()}>
        <div className="modal-header">
          <div>
            <h2>Nouvelle demande client</h2>
            <p className="modal-subtitle">Le contact client sera créé ou mis à jour automatiquement dans le carnet de contacts.</p>
          </div>
          <button type="button" className="modal-close" onClick={onClose} aria-label="Fermer">
            ×
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="modal-body form-grid">
            <ContactSearchField
              id="cr-company"
              label="Entreprise"
              field="company"
              required
              value={form.company}
              onChange={(value) => set("company", value)}
              onSelect={applyContact}
            />
            <ContactSearchField
              id="cr-contactName"
              label="Nom du contact"
              field="name"
              required
              value={form.contactName}
              onChange={(value) => set("contactName", value)}
              onSelect={applyContact}
            />

            <div className="field">
              <label htmlFor="cr-contactRole">Rôle du contact (facultatif)</label>
              <input id="cr-contactRole" value={form.contactRole} onChange={(e) => set("contactRole", e.target.value)} />
            </div>
            <div className="field">
              <label htmlFor="cr-phone">Téléphone</label>
              <input id="cr-phone" required value={form.phone} onChange={(e) => set("phone", e.target.value)} />
            </div>

            <div className="field">
              <label htmlFor="cr-email">Courriel</label>
              <input id="cr-email" type="email" required value={form.email} onChange={(e) => set("email", e.target.value)} />
            </div>
            <div className="field">
              <label htmlFor="cr-address">Adresse (facultatif)</label>
              <input id="cr-address" value={form.address} onChange={(e) => set("address", e.target.value)} />
            </div>

            <div className="field">
              <label htmlFor="cr-requestType">Type de demande</label>
              <select id="cr-requestType" value={form.requestType} onChange={(e) => set("requestType", e.target.value as RequestType)}>
                {Object.entries(REQUEST_TYPE_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor="cr-urgency">Urgence</label>
              <select id="cr-urgency" value={form.urgency} onChange={(e) => set("urgency", e.target.value as Urgency)}>
                {Object.entries(URGENCY_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </div>

            <div className="field">
              <label htmlFor="cr-channel">Canal d'entrée</label>
              <select id="cr-channel" required value={form.salesChannelId} onChange={(e) => set("salesChannelId", e.target.value)}>
                <option value="">— Choisir —</option>
                {channelsQuery.data?.salesChannels.map((channel) => (
                  <option key={channel.id} value={channel.id}>
                    {channel.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor="cr-sourceDetail">Précision sur la provenance (facultatif)</label>
              <input
                id="cr-sourceDetail"
                placeholder="Nom du référent, campagne, événement…"
                value={form.sourceDetail}
                onChange={(e) => set("sourceDetail", e.target.value)}
              />
            </div>

            <div className="field">
              <label htmlFor="cr-nextFollowUp">Date de relance (facultatif)</label>
              <input id="cr-nextFollowUp" type="date" value={form.nextFollowUp} onChange={(e) => set("nextFollowUp", e.target.value)} />
            </div>

            <div className="field field-full">
              <label htmlFor="cr-summary">Résumé détaillé de la demande</label>
              <textarea id="cr-summary" required rows={4} value={form.summary} onChange={(e) => set("summary", e.target.value)} />
            </div>
          </div>

          {error && <p className="form-error">{error}</p>}

          <div className="modal-footer">
            <button type="button" className="btn btn-secondary" onClick={onClose}>
              Annuler
            </button>
            <button type="submit" className="btn" disabled={mutation.isPending}>
              {mutation.isPending ? "Création…" : "Créer la demande et le contact"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
