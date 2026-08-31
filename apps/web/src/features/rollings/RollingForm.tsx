import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { canCreateBudgetFromRequest, type Persona } from "@gsc-pilot/business-rules";
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
  persona: Persona;
  onClose: () => void;
  onCreated: (id: string) => void;
  prefillFromRequest?: RollingPrefillFromRequest;
}

/**
 * Extrait de RollingsPage.tsx (31 août 2026, demande explicite de
 * l'utilisatrice : « il faut que ce soit aussi une fenêtre contextuelle
 * plutôt que directement à l'écran ») — même contenu/logique qu'avant, y
 * compris le bouton "Construire un budgétaire à la place" (son
 * repositionnement reste une correction séparée, en attente de son analyse
 * — voir CLAUDE.md/historique des tâches). Seul le conteneur change :
 * section intégrée à la page → modale, même patron que
 * ClientRequestForm/BudgetForm/ProjectForm.
 *
 * prefillFromRequest (même jour, demande de convertir aussi les demandes
 * clients en roulement depuis Options) — même patron que
 * ServiceCallForm.tsx : contact préaffiché depuis la demande, nudge "ou
 * construisez un budgétaire" masqué (déjà choisi cette voie en cliquant
 * l'option), toujours un nouveau contact via ensureContactRow côté serveur
 * (dédoublonne automatiquement, jamais un contactId réutilisé directement,
 * même logique partout).
 */
export function RollingForm({ persona, onClose, onCreated, prefillFromRequest }: RollingFormProps) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const canCreateBudget = canCreateBudgetFromRequest(persona) && !prefillFromRequest;
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
    <div className="modal-backdrop" onClick={onClose}>
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

        {canCreateBudget && (
          <div style={{ margin: "0 24px 14px" }}>
            <p style={{ margin: "0 0 8px", color: "var(--gsc-color-muted)", fontSize: 13 }}>
              Pour un roulement chiffré à l'avance (heures, achats, prix de vente), construisez plutôt un budgétaire —
              il deviendra ce roulement via « Convertir en roulement » une fois le contrat obtenu.
            </p>
            <button
              type="button"
              className="btn btn-secondary btn-small"
              onClick={() => {
                onClose();
                navigate("/budgetaire");
              }}
            >
              🧮 Construire un budgétaire à la place
            </button>
            <p style={{ margin: "14px 0 0", color: "var(--gsc-color-muted)", fontSize: 13, fontWeight: 600 }}>
              — ou créez directement, sans budgétaire —
            </p>
          </div>
        )}

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
