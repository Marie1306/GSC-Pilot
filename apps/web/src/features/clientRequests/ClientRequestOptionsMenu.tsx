import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { canCreateBudgetFromRequest, canDeleteClientRequest } from "@gsc-pilot/business-rules";
import { useAuth } from "../../lib/auth/useAuth.js";
import { ApiError } from "../../lib/apiClient.js";
import { OptionsDrawer, OptionRow, OptionSection } from "../../components/OptionsDrawer.js";
import {
  transferClientRequestToOwner,
  updateClientRequestFollowUp,
  updateClientRequestStatus,
  deleteClientRequest,
  type ClientRequestDetail,
} from "./api.js";

interface ClientRequestOptionsMenuProps {
  request: ClientRequestDetail;
  open: boolean;
  onClose: () => void;
  onDeleted: () => void;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("fr-CA", { year: "numeric", month: "short", day: "numeric" });
}

/**
 * Menu Options d'une demande client (18 août 2026) — 5 actions demandées
 * explicitement par l'utilisatrice après comparaison avec la référence v19
 * (Créer le budgétaire, Transférer au Propriétaire, Planifier un suivi,
 * Marquer perdue, Supprimer la demande); "Prendre en charge"/Appeler/
 * Courriel de la v19 volontairement omis — déjà couverts autrement
 * (pastille de statut, coordonnées déjà affichées). transmittedToOwnerAt/
 * nextFollowUp/lostReason/deletedAt étaient déjà réservés au schéma depuis
 * le 12 août 2026 (portée reportée jusqu'à maintenant, confirmée comme un
 * suivi actif, pas oubliée). "Marquer perdue" déménagée ici depuis les
 * pastilles de statut de ClientRequestDetail.tsx (qui gardent seulement
 * Nouvelle/En traitement) — la référence v19 traite aussi la perte comme
 * une action dédiée, pas un état de pastille parmi d'autres.
 */
export function ClientRequestOptionsMenu({ request, open, onClose, onDeleted }: ClientRequestOptionsMenuProps) {
  const { employee } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [showFollowUpForm, setShowFollowUpForm] = useState(false);
  const [followUpDate, setFollowUpDate] = useState(request.nextFollowUp?.slice(0, 10) ?? "");
  const [pendingLostReason, setPendingLostReason] = useState(false);
  const [lostReason, setLostReason] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const invalidate = () => {
    setError(null);
    void queryClient.invalidateQueries({ queryKey: ["client-request", request.id] });
    void queryClient.invalidateQueries({ queryKey: ["client-requests"] });
  };
  const onMutationError = (err: unknown) => setError(err instanceof ApiError ? err.message : "Une erreur est survenue — réessayez.");

  const transferMutation = useMutation({
    mutationFn: () => transferClientRequestToOwner(request.id),
    onSuccess: invalidate,
    onError: onMutationError,
  });
  const followUpMutation = useMutation({
    mutationFn: (date: string) => updateClientRequestFollowUp(request.id, date || null),
    onSuccess: () => {
      setShowFollowUpForm(false);
      invalidate();
    },
    onError: onMutationError,
  });
  const lostMutation = useMutation({
    mutationFn: (reason: string) => updateClientRequestStatus(request.id, "lost", reason),
    onSuccess: () => {
      setPendingLostReason(false);
      setLostReason("");
      invalidate();
    },
    onError: onMutationError,
  });
  const deleteMutation = useMutation({
    mutationFn: () => deleteClientRequest(request.id),
    onSuccess: () => {
      invalidate();
      onDeleted();
    },
    onError: onMutationError,
  });

  if (!open || !employee) return null;
  const canCreateBudget = canCreateBudgetFromRequest(employee.persona);
  const canDelete = canDeleteClientRequest(employee.persona);
  const isLost = request.status === "lost";
  const isConverted = !!request.budgetId;

  return (
    <OptionsDrawer eyebrow="Options de la demande" title={`${request.displayId} — ${request.company ?? request.contactName}`} onClose={onClose}>
      {error && <p className="form-error">{error}</p>}

      <OptionSection title="Conversion">
        {isConverted ? (
          <OptionRow icon="🧮" label="Budgétaire déjà créé pour cette demande" disabled disabledNote="Une demande ne peut avoir qu'un seul budgétaire." />
        ) : (
          <OptionRow icon="🧮" label="Créer le budgétaire" onClick={() => navigate(`/budgetaire?newFromRequest=${request.id}`)} disabled={!canCreateBudget} disabledNote="Direction ou Propriétaire seulement." />
        )}
      </OptionSection>

      <OptionSection title="Suivi">
        {request.transmittedToOwnerAt ? (
          <OptionRow icon="🔗" label={`Transférée au Propriétaire le ${formatDate(request.transmittedToOwnerAt)}`} disabled />
        ) : (
          <OptionRow icon="🔗" label="Transférer au Propriétaire" onClick={() => transferMutation.mutate()} disabled={transferMutation.isPending} />
        )}
        <OptionRow icon="📅" label="Planifier un suivi" onClick={() => setShowFollowUpForm((v) => !v)} />
        {showFollowUpForm && (
          <div className="form-grid" style={{ marginTop: 8, marginBottom: 4 }}>
            <div className="field">
              <label>Date de relance</label>
              <input type="date" value={followUpDate} onChange={(e) => setFollowUpDate(e.target.value)} />
            </div>
            <div className="field field-full" style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <button type="button" className="btn btn-small" disabled={followUpMutation.isPending} onClick={() => followUpMutation.mutate(followUpDate)}>
                {followUpMutation.isPending ? "…" : "Enregistrer"}
              </button>
              <button type="button" className="btn btn-secondary btn-small" onClick={() => setShowFollowUpForm(false)}>
                Annuler
              </button>
            </div>
          </div>
        )}
      </OptionSection>

      <OptionSection title="Statut">
        {isLost ? (
          <OptionRow icon="✕" label={`Marquée perdue${request.lostReason ? ` — ${request.lostReason}` : ""}`} disabled />
        ) : (
          <OptionRow icon="✕" label="Marquer perdue" onClick={() => setPendingLostReason(true)} />
        )}
        {pendingLostReason && (
          <div className="form-grid" style={{ marginTop: 8, marginBottom: 4 }}>
            <div className="field field-full">
              <label>Raison (facultatif)</label>
              <input value={lostReason} onChange={(e) => setLostReason(e.target.value)} />
            </div>
            <div className="field field-full" style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <button type="button" className="btn btn-small" disabled={lostMutation.isPending} onClick={() => lostMutation.mutate(lostReason)}>
                {lostMutation.isPending ? "…" : "Confirmer perdue"}
              </button>
              <button type="button" className="btn btn-secondary btn-small" onClick={() => setPendingLostReason(false)}>
                Annuler
              </button>
            </div>
          </div>
        )}
      </OptionSection>

      {canDelete && (
        <div style={{ marginTop: 18, paddingTop: 14, borderTop: "1px solid var(--gsc-color-line)" }}>
          <p style={{ margin: "0 0 10px", fontSize: 12, textTransform: "uppercase", letterSpacing: 0.04, color: "var(--gsc-color-muted)" }}>
            Actions sensibles
          </p>
          {isConverted ? (
            <p style={{ margin: 0, fontSize: 13, color: "var(--gsc-color-muted)" }}>
              Cette demande a déjà un budgétaire — elle ne peut plus être supprimée.
            </p>
          ) : !confirmDelete ? (
            <button type="button" className="btn btn-secondary btn-small" onClick={() => setConfirmDelete(true)}>
              Supprimer la demande
            </button>
          ) : (
            <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
              <span style={{ fontSize: 13 }}>Envoyer à la corbeille — confirmer ?</span>
              <button type="button" className="btn btn-small" disabled={deleteMutation.isPending} onClick={() => deleteMutation.mutate()}>
                {deleteMutation.isPending ? "…" : "Confirmer la suppression"}
              </button>
              <button type="button" className="btn btn-secondary btn-small" onClick={() => setConfirmDelete(false)}>
                Annuler
              </button>
            </div>
          )}
        </div>
      )}
    </OptionsDrawer>
  );
}
