import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ApiError } from "../../lib/apiClient.js";
import { ContactSearchField } from "../contacts/ContactAutocomplete.js";
import type { ContactListItemDto } from "../contacts/api.js";
import { createRollingDirect } from "./api.js";

/** Conversion directe d'une demande client en roulement (31 août 2026) — voir ClientRequestOptionsMenu. */
export interface RollingPrefillFromRequest {
  clientRequestId: string;
  requestDisplayId: string;
  contactName: string;
  company?: string;
  phone?: string;
  email?: string;
}

interface RollingFormProps {
  onClose: () => void;
  onCreated: (id: string) => void;
  prefillFromRequest?: RollingPrefillFromRequest;
}

/**
 * Extrait de RollingsPage.tsx (31 août 2026, demande explicite de
 * l'utilisatrice : « il faut que ce soit aussi une fenêtre contextuelle
 * plutôt que directement à l'écran ») — même contenu/logique qu'avant. Seul
 * le conteneur change : section intégrée à la page → modale, même patron
 * que ClientRequestForm/BudgetForm/ProjectForm.
 *
 * prefillFromRequest (même jour, demande de convertir aussi les demandes
 * clients en roulement depuis Options) — même patron que
 * ServiceCallForm.tsx : contact préaffiché depuis la demande, toujours un
 * nouveau contact via ensureContactRow côté serveur (dédoublonne
 * automatiquement, jamais un contactId réutilisé directement, même logique
 * partout).
 *
 * Plus de nudge "Construire un budgétaire à la place" ici (31 août 2026,
 * demande explicite : « la création du budgétaire d'un nouveau roulement
 * doit se faire après la création de celle-ci »). Le formulaire de création
 * directe est maintenant la toute première chose visible, sans détour — la
 * construction d'un budgétaire après coup se fait depuis le menu Options du
 * roulement déjà créé (voir RollingOptionsMenu.tsx).
 */
export function RollingForm({ onClose, onCreated, prefillFromRequest }: RollingFormProps) {
  const queryClient = useQueryClient();
  const [contactName, setContactName] = useState(prefillFromRequest?.contactName ?? "");
  const [company, setCompany] = useState(prefillFromRequest?.company ?? "");
  const [phone, setPhone] = useState(prefillFromRequest?.phone ?? "");
  const [email, setEmail] = useState(prefillFromRequest?.email ?? "");
  const [error, setError] = useState<string | null>(null);

  const createMutation = useMutation({
    mutationFn: () =>
      createRollingDirect(
        {
          contactName: contactName.trim(),
          company: company.trim() || undefined,
          phone: phone.trim() || undefined,
          email: email.trim() || undefined,
        },
        prefillFromRequest?.clientRequestId,
      ),
    onSuccess: ({ rolling }) => {
      void queryClient.invalidateQueries({ queryKey: ["rollings"] });
      if (prefillFromRequest) {
        void queryClient.invalidateQueries({ queryKey: ["client-request", prefillFromRequest.clientRequestId] });
        void queryClient.invalidateQueries({ queryKey: ["client-requests"] });
      }
      onCreated(rolling.id);
    },
    onError: (err: unknown) => setError(err instanceof ApiError ? err.message : "Une erreur est survenue — réessayez."),
  });

  function applyContact(contact: ContactListItemDto) {
    setContactName(contact.name);
    setCompany(contact.company ?? "");
    setPhone(contact.phone ?? "");
    setEmail(contact.email ?? "");
  }

  return (
    <div className="modal-backdrop">
      <div className="modal" onClick={(event) => event.stopPropagation()}>
        <div className="modal-header">
          <div>
            <h2>{prefillFromRequest ? "Convertir en roulement" : "Nouveau roulement"}</h2>
            <p className="modal-subtitle">
              {prefillFromRequest
                ? `Pré-rempli depuis la demande ${prefillFromRequest.requestDisplayId} — vérifiez avant de créer.`
                : "Création directe : heures/achats/prix restent à zéro tant qu'ils ne sont pas saisis manuellement."}
            </p>
          </div>
          <button type="button" className="modal-close" onClick={onClose} aria-label="Fermer">
            ×
          </button>
        </div>

        <form
          onSubmit={(event) => {
            event.preventDefault();
            if (!contactName.trim()) return;
            createMutation.mutate();
          }}
        >
          <div className="modal-body form-grid">
            <ContactSearchField id="rl-contactName" label="Nom du contact" field="name" value={contactName} onChange={setContactName} onSelect={applyContact} />
            <ContactSearchField id="rl-company" label="Entreprise (facultatif)" field="company" value={company} onChange={setCompany} onSelect={applyContact} />
            <div className="field">
              <label htmlFor="rl-phone">Téléphone (facultatif)</label>
              <input id="rl-phone" value={phone} onChange={(e) => setPhone(e.target.value)} />
            </div>
            <div className="field">
              <label htmlFor="rl-email">Courriel (facultatif)</label>
              <input id="rl-email" value={email} onChange={(e) => setEmail(e.target.value)} />
            </div>
          </div>

          {error && <p className="form-error">{error}</p>}

          <div className="modal-footer">
            <button type="submit" className="btn" disabled={!contactName.trim() || createMutation.isPending}>
              {createMutation.isPending ? "Création…" : "Créer"}
            </button>
            <button type="button" className="btn btn-secondary" onClick={onClose}>
              Annuler
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
