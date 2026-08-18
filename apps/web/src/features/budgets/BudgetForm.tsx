import { useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ApiError } from "../../lib/apiClient.js";
import { fetchClientRequests, fetchSalesChannels, createBudget, URGENCY_LABELS, type NewClientRequestForBudget, type Urgency } from "./api.js";

interface BudgetFormProps {
  onClose: () => void;
  onCreated: (id: string) => void;
  /** Pré-sélection depuis "Créer le budgétaire" du menu Options d'une demande client (18 août 2026). */
  initialRequestId?: string;
}

type NewRequestType = NewClientRequestForBudget["requestType"];

const NEW_REQUEST_TYPE_LABELS: Record<NewRequestType, string> = {
  project: "Projet",
  rolling: "Roulement",
  service: "Call de service",
};

const EMPTY_NEW_REQUEST: NewClientRequestForBudget = {
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
  summary: "",
};

/**
 * Flux de création unifié vérifié dans le prototype v19 (budgetStartModal) :
 * un seul formulaire, soit on choisit une demande existante, soit on laisse
 * l'application créer le contact et la demande client automatiquement — pas
 * deux mécanismes séparés.
 */
export function BudgetForm({ onClose, onCreated, initialRequestId }: BudgetFormProps) {
  const queryClient = useQueryClient();
  const requestsQuery = useQuery({ queryKey: ["client-requests"], queryFn: fetchClientRequests });
  const channelsQuery = useQuery({ queryKey: ["sales-channels"], queryFn: fetchSalesChannels });
  const [selectedRequestId, setSelectedRequestId] = useState(initialRequestId ?? "");
  const [newRequest, setNewRequest] = useState<NewClientRequestForBudget>(EMPTY_NEW_REQUEST);
  const [error, setError] = useState<string | null>(null);

  const availableRequests = (requestsQuery.data?.clientRequests ?? []).filter(
    (request) => !request.budgetId && request.status !== "lost" && request.requestType !== "information",
  );

  const mutation = useMutation({
    mutationFn: () =>
      createBudget(
        selectedRequestId
          ? { clientRequestId: selectedRequestId }
          : {
              newClientRequest: {
                ...newRequest,
                contactRole: newRequest.contactRole?.trim() || undefined,
                address: newRequest.address?.trim() || undefined,
                sourceDetail: newRequest.sourceDetail?.trim() || undefined,
              },
            },
      ),
    onSuccess: (result) => {
      void queryClient.invalidateQueries({ queryKey: ["budgets"] });
      void queryClient.invalidateQueries({ queryKey: ["client-requests"] });
      onCreated(result.id);
    },
    onError: (err) => setError(err instanceof ApiError ? err.message : "Erreur lors de la création — vérifiez les champs et réessayez."),
  });

  function set<K extends keyof NewClientRequestForBudget>(key: K, value: NewClientRequestForBudget[K]) {
    setNewRequest((current) => ({ ...current, [key]: value }));
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
            <h2>Débuter un budgétaire</h2>
            <p className="modal-subtitle">
              Sélectionnez une demande existante. Sans demande, l'application créera automatiquement le contact et la demande client.
            </p>
          </div>
          <button type="button" className="modal-close" onClick={onClose} aria-label="Fermer">
            ×
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="modal-body form-grid">
            <div className="field field-full">
              <label htmlFor="bg-request">Demande client existante (recommandé)</label>
              <select id="bg-request" value={selectedRequestId} onChange={(e) => setSelectedRequestId(e.target.value)}>
                <option value="">— Nouveau contact et nouvelle demande —</option>
                {availableRequests.map((request) => (
                  <option key={request.id} value={request.id}>
                    {request.displayId} — {request.company ?? request.contactName} — {request.summary.slice(0, 70)}
                  </option>
                ))}
              </select>
            </div>

            {!selectedRequestId && (
              <>
                <div className="field">
                  <label htmlFor="bg-company">Entreprise</label>
                  <input id="bg-company" required value={newRequest.company} onChange={(e) => set("company", e.target.value)} />
                </div>
                <div className="field">
                  <label htmlFor="bg-contactName">Nom du contact</label>
                  <input id="bg-contactName" required value={newRequest.contactName} onChange={(e) => set("contactName", e.target.value)} />
                </div>

                <div className="field">
                  <label htmlFor="bg-contactRole">Rôle du contact (facultatif)</label>
                  <input id="bg-contactRole" value={newRequest.contactRole} onChange={(e) => set("contactRole", e.target.value)} />
                </div>
                <div className="field">
                  <label htmlFor="bg-phone">Téléphone</label>
                  <input id="bg-phone" required value={newRequest.phone} onChange={(e) => set("phone", e.target.value)} />
                </div>

                <div className="field">
                  <label htmlFor="bg-email">Courriel</label>
                  <input id="bg-email" type="email" required value={newRequest.email} onChange={(e) => set("email", e.target.value)} />
                </div>
                <div className="field">
                  <label htmlFor="bg-address">Adresse (facultatif)</label>
                  <input id="bg-address" value={newRequest.address} onChange={(e) => set("address", e.target.value)} />
                </div>

                <div className="field">
                  <label htmlFor="bg-requestType">Type prévu</label>
                  <select id="bg-requestType" value={newRequest.requestType} onChange={(e) => set("requestType", e.target.value as NewRequestType)}>
                    {Object.entries(NEW_REQUEST_TYPE_LABELS).map(([value, label]) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="field">
                  <label htmlFor="bg-urgency">Urgence</label>
                  <select id="bg-urgency" value={newRequest.urgency} onChange={(e) => set("urgency", e.target.value as Urgency)}>
                    {Object.entries(URGENCY_LABELS).map(([value, label]) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="field">
                  <label htmlFor="bg-channel">Canal d'entrée</label>
                  <select id="bg-channel" required value={newRequest.salesChannelId} onChange={(e) => set("salesChannelId", e.target.value)}>
                    <option value="">— Choisir —</option>
                    {channelsQuery.data?.salesChannels.map((channel) => (
                      <option key={channel.id} value={channel.id}>
                        {channel.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="field field-full">
                  <label htmlFor="bg-sourceDetail">Précision sur la provenance (facultatif)</label>
                  <input
                    id="bg-sourceDetail"
                    placeholder="Nom du référent, campagne, événement…"
                    value={newRequest.sourceDetail}
                    onChange={(e) => set("sourceDetail", e.target.value)}
                  />
                </div>

                <div className="field field-full">
                  <label htmlFor="bg-summary">Résumé de la demande</label>
                  <textarea id="bg-summary" required rows={4} value={newRequest.summary} onChange={(e) => set("summary", e.target.value)} />
                </div>
              </>
            )}
          </div>

          {error && <p className="form-error">{error}</p>}

          <div className="modal-footer">
            <button type="button" className="btn btn-secondary" onClick={onClose}>
              Annuler
            </button>
            <button type="submit" className="btn" disabled={mutation.isPending}>
              {mutation.isPending ? "Création…" : "Créer le budgétaire"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
