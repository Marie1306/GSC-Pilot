import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { canManageRolling, canArchiveRolling, canDeleteRolling, canCreateServiceCall } from "@gsc-pilot/business-rules";
import { useAuth } from "../../lib/auth/useAuth.js";
import { ApiError } from "../../lib/apiClient.js";
import { OptionsDrawer, OptionRow, OptionSection } from "../../components/OptionsDrawer.js";
import { updateContact } from "../contacts/api.js";
import { setRollingArchived, deleteRolling, type RollingDetailDto } from "./api.js";
import { RollingPostMortem } from "./RollingPostMortem.js";
import { RollingHoursDetail } from "./RollingHoursDetail.js";
import { ManualEntryModal } from "../timePunch/ManualEntryModal.js";
import { ServiceCallForm } from "../serviceCalls/ServiceCallForm.js";

interface RollingOptionsMenuProps {
  rolling: RollingDetailDto;
  open: boolean;
  onClose: () => void;
  onDeleted: () => void;
  /** Ferme le tiroir ET déclenche l'ouverture de la modale Achats réels (RollingPurchaseEntries, composant frère) — même patron que ProjectOptionsMenu/onAddPurchase. */
  onAddPurchase: () => void;
}

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString("fr-CA", { year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

/**
 * Menu Options du roulement (28 août 2026, demande de l'utilisatrice) —
 * structure calquée sur ProjectOptionsMenu.tsx, section par section. "Code
 * QR" volontairement absent pour l'instant : contrairement à Project, Rolling
 * n'a pas de numéro d'affichage à encoder (question posée à l'utilisatrice,
 * jamais deviné un format). "Modifier les informations" édite le CONTACT du
 * roulement (nom/entreprise/téléphone/courriel, via le module Contacts
 * existant) plutôt qu'un nom/échéance propre au dossier — Rolling n'a ni
 * l'un ni l'autre, contrairement à Project.
 */
export function RollingOptionsMenu({ rolling, open, onClose, onDeleted, onAddPurchase }: RollingOptionsMenuProps) {
  const { employee } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [editForm, setEditForm] = useState(false);
  const [contactName, setContactName] = useState(rolling.contactName);
  const [company, setCompany] = useState(rolling.company ?? "");
  const [phone, setPhone] = useState(rolling.contactPhone ?? "");
  const [email, setEmail] = useState(rolling.contactEmail ?? "");
  const [showPostMortem, setShowPostMortem] = useState(false);
  const [showHoursDetail, setShowHoursDetail] = useState(false);
  const [showManualEntry, setShowManualEntry] = useState(false);
  const [showCreateCall, setShowCreateCall] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const invalidate = () => {
    setError(null);
    void queryClient.invalidateQueries({ queryKey: ["rolling", rolling.id] });
    void queryClient.invalidateQueries({ queryKey: ["rollings"] });
  };
  const onMutationError = (err: unknown) => setError(err instanceof ApiError ? err.message : "Une erreur est survenue — réessayez.");

  const updateMutation = useMutation({
    mutationFn: () =>
      updateContact(rolling.contactId, {
        name: contactName.trim(),
        company: company.trim() || null,
        phone: phone.trim() || null,
        email: email.trim() || null,
      }),
    onSuccess: () => {
      setEditForm(false);
      invalidate();
    },
    onError: onMutationError,
  });
  const archiveMutation = useMutation({
    mutationFn: (archived: boolean) => setRollingArchived(rolling.id, archived),
    onSuccess: invalidate,
    onError: onMutationError,
  });
  const deleteMutation = useMutation({
    mutationFn: () => deleteRolling(rolling.id),
    onSuccess: () => {
      invalidate();
      onDeleted();
    },
    onError: onMutationError,
  });

  if (!employee) return null;
  const canManage = canManageRolling(employee.persona);
  const canArchive = canArchiveRolling(employee.persona);
  const canDelete = canDeleteRolling(employee.persona);
  const canCreateCall = canCreateServiceCall(employee.persona);
  const isArchived = !!rolling.archivedAt;
  const label = rolling.company ?? rolling.contactName;

  return (
    <>
      {open && (
        <OptionsDrawer eyebrow="Options du roulement" title={label} onClose={onClose}>
          {error && <p className="form-error">{error}</p>}

          {editForm ? (
            <form
              className="form-grid"
              style={{ marginTop: 14 }}
              onSubmit={(event) => {
                event.preventDefault();
                if (contactName.trim()) updateMutation.mutate();
              }}
            >
              <div className="field">
                <label>Nom du contact</label>
                <input value={contactName} onChange={(e) => setContactName(e.target.value)} />
              </div>
              <div className="field">
                <label>Entreprise</label>
                <input value={company} onChange={(e) => setCompany(e.target.value)} />
              </div>
              <div className="field">
                <label>Téléphone</label>
                <input value={phone} onChange={(e) => setPhone(e.target.value)} />
              </div>
              <div className="field">
                <label>Courriel</label>
                <input value={email} onChange={(e) => setEmail(e.target.value)} />
              </div>
              <div className="field field-full" style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <button type="submit" className="btn btn-small" disabled={!contactName.trim() || updateMutation.isPending}>
                  {updateMutation.isPending ? "…" : "Enregistrer"}
                </button>
                <button type="button" className="btn btn-secondary btn-small" onClick={() => setEditForm(false)}>
                  Annuler
                </button>
              </div>
            </form>
          ) : (
            <>
              {canManage && (
                <OptionSection title="Roulement">
                  <OptionRow icon="✏️" label="Modifier les informations" onClick={() => setEditForm(true)} />
                </OptionSection>
              )}

              <OptionSection title="Heures et opérations">
                <OptionRow
                  icon="🕒"
                  label="Ajouter une entrée manuelle"
                  onClick={() => {
                    onClose();
                    setShowManualEntry(true);
                  }}
                />
                <OptionRow
                  icon="🛒"
                  label="Ajouter un achat"
                  onClick={() => {
                    onClose();
                    onAddPurchase();
                  }}
                />
                <OptionRow
                  icon="📞"
                  label="Créer un call lié"
                  onClick={() => {
                    onClose();
                    setShowCreateCall(true);
                  }}
                  disabled={!canCreateCall}
                  disabledNote="Direction, Administration ou Propriétaire seulement."
                />
                <OptionRow
                  icon="🕒"
                  label="Consulter les heures"
                  onClick={() => {
                    onClose();
                    setShowHoursDetail(true);
                  }}
                />
              </OptionSection>

              <OptionSection title="Documents et suivi">
                <OptionRow
                  icon="📄"
                  label="Post-mortem"
                  onClick={() => {
                    onClose();
                    setShowPostMortem(true);
                  }}
                />
              </OptionSection>

              <OptionSection title="Contact">
                <OptionRow icon="👤" label="Accéder au contact" onClick={() => navigate(`/contacts?open=${rolling.contactId}`)} />
              </OptionSection>

              {rolling.clientRequestId && (
                <OptionSection title="Demande client d'origine">
                  <OptionRow icon="📞" label="Accéder à la demande" onClick={() => navigate(`/demandes?open=${rolling.clientRequestId}`)} />
                </OptionSection>
              )}
            </>
          )}

          {(canArchive || canDelete) && (
            <div style={{ marginTop: 18, paddingTop: 14, borderTop: "1px solid var(--gsc-color-line)" }}>
              <p style={{ margin: "0 0 10px", fontSize: 12, textTransform: "uppercase", letterSpacing: 0.04, color: "var(--gsc-color-muted)" }}>
                Actions sensibles
              </p>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                {canArchive && (
                  <button
                    type="button"
                    className="btn btn-secondary btn-small"
                    disabled={archiveMutation.isPending}
                    onClick={() => archiveMutation.mutate(!isArchived)}
                  >
                    {isArchived ? "Désarchiver le roulement" : "Archiver le roulement"}
                  </button>
                )}
                {canDelete &&
                  !rolling.deletedAt &&
                  (!confirmDelete ? (
                    <button type="button" className="btn btn-secondary btn-small" onClick={() => setConfirmDelete(true)}>
                      Supprimer le roulement
                    </button>
                  ) : (
                    <>
                      <span style={{ fontSize: 13, alignSelf: "center" }}>Envoyer à la corbeille — confirmer ?</span>
                      <button type="button" className="btn btn-small" disabled={deleteMutation.isPending} onClick={() => deleteMutation.mutate()}>
                        {deleteMutation.isPending ? "…" : "Confirmer la suppression"}
                      </button>
                      <button type="button" className="btn btn-secondary btn-small" onClick={() => setConfirmDelete(false)}>
                        Annuler
                      </button>
                    </>
                  ))}
              </div>
              {isArchived && (
                <p style={{ margin: "10px 0 0", fontSize: 13, color: "var(--gsc-color-muted)" }}>
                  Roulement archivé le {formatDateTime(rolling.archivedAt!)} — reste accessible ici, seulement sorti des listes actives.
                </p>
              )}
            </div>
          )}
        </OptionsDrawer>
      )}

      {showPostMortem && <RollingPostMortem id={rolling.id} onClose={() => setShowPostMortem(false)} />}
      {showHoursDetail && <RollingHoursDetail rolling={{ id: rolling.id, label }} onClose={() => setShowHoursDetail(false)} />}
      {showManualEntry && <ManualEntryModal onClose={() => setShowManualEntry(false)} initialRollingId={rolling.id} />}
      {showCreateCall && (
        <ServiceCallForm
          onClose={() => setShowCreateCall(false)}
          prefillFromRolling={{
            rollingId: rolling.id,
            rollingLabel: label,
            contactName: rolling.contactName,
            company: rolling.company ?? undefined,
            phone: rolling.contactPhone ?? undefined,
            email: rolling.contactEmail ?? undefined,
          }}
        />
      )}
    </>
  );
}
