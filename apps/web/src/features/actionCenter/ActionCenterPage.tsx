import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link, useSearchParams } from "react-router-dom";
import { canAccessOverviewViews } from "@gsc-pilot/business-rules";
import { useAuth } from "../../lib/auth/useAuth.js";
import { formatCurrency } from "../projects/api.js";
import { fetchActionCenterItems, linkFor, type ActionItemDto, type ActionItemType } from "./api.js";
import { BudgetDetail } from "../budgets/BudgetDetail.js";
import { ClientRequestDetail } from "../clientRequests/ClientRequestDetail.js";
import { PurchaseRequestActionDrawer } from "../purchases/PurchaseRequestActionDrawer.js";
import { PurchaseFulfillmentActionDrawer } from "../purchases/PurchaseFulfillmentActionDrawer.js";
import { InvoiceDetailDrawer } from "../invoicing/InvoiceDetailDrawer.js";
import { TimeEntryActionDrawer } from "../timePunch/TimeEntryActionDrawer.js";
import { SendNoteModal } from "../teamNotes/SendNoteModal.js";
import { fetchTeamNotesInbox, fetchAllArchivedTeamNotes, markTeamNoteRead, PERSONA_LABELS, type TeamNoteDto } from "../teamNotes/api.js";
import "./actionCenter.css";

const TYPE_ORDER: ActionItemType[] = [
  "client_request_new",
  "followup_due",
  "budget_approval",
  "hours_approval",
  "purchase_approval",
  "purchase_to_order",
  "invoicing",
  "client_request_transmitted",
  "subassembly_ready",
];

// Types qui ouvrent directement le détail + les actions réelles sans
// quitter le Centre d'actions (25 août 2026, demande explicite) — chacun
// réutilise le composant déjà construit et vérifié de son propre module,
// jamais une deuxième logique d'approbation ici. Seul subassembly_ready
// reste une navigation classique : créer la liste de pièces est un
// formulaire à plusieurs lignes qui vit en profondeur dans la carte
// Assemblages (module Sous-assemblages en interne), pas extractible
// proprement dans un tiroir.
//
// purchase_to_order utilisait la même approche (lien vers /achats) jusqu'au
// 27 août 2026 — rapport de l'utilisatrice : ça amenait sur une page
// générale sans rien de concret à faire, les demandes s'accumulaient sans
// façon de les faire disparaître d'ici. Passé en tiroir (comme les autres)
// avec l'action unique pertinente à cette étape : marquer commandé.
function hasActionDrawer(type: ActionItemType): boolean {
  return type !== "subassembly_ready";
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("fr-CA", { year: "numeric", month: "short", day: "numeric" });
}

/** Historique complet des notes archivées — "Afficher toutes les notes" (29 août 2026). */
function AllArchivedNotesModal({ onClose }: { onClose: () => void }) {
  const query = useQuery({ queryKey: ["team-notes", "archive"], queryFn: fetchAllArchivedTeamNotes });
  const notes = query.data?.notes ?? [];
  return (
    <div className="modal-backdrop">
      <div className="modal" onClick={(event) => event.stopPropagation()}>
        <div className="modal-header">
          <h2>Toutes les notes reçues</h2>
          <button type="button" className="modal-close" onClick={onClose} aria-label="Fermer">
            ×
          </button>
        </div>
        <div className="modal-body">
          {query.isSuccess && notes.length === 0 && <p style={{ color: "var(--gsc-color-muted)", fontSize: 13 }}>Aucune note archivée.</p>}
          <div className="action-item-list">
            {notes.map((note) => (
              <div key={note.id} className="action-item-row" style={{ cursor: "default" }}>
                <div className="action-item-main">
                  <span className="action-item-label">
                    {note.senderName} <span className="cell-sub">({PERSONA_LABELS[note.senderPersona]})</span>
                  </span>
                  <span className="action-item-sublabel">{note.body}</span>
                </div>
                <span className="action-item-date">{formatDate(note.readAt ?? note.createdAt)}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * Centre d'actions (21 août 2026, spec confirmée) — point central pour
 * Direction/Administration/Propriétaire : agrège les items déjà calculés
 * par action-center/service.ts (chaque type rejoue la vraie règle
 * d'autorisation de son module d'origine, jamais une approximation ici).
 */
export function ActionCenterPage() {
  const { employee } = useAuth();
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  // Les 8 catégories existantes restent Direction/Administration/Propriétaire
  // (canAccessOverviewViews) — sans ce enabled, Employé/Magasinier (qui
  // atteignent maintenant la page, voir nav.ts canAccessActionCenter)
  // recevraient un 403 sur cette requête et verraient un message d'erreur
  // trompeur au lieu de simplement ne rien voir ici.
  const itemsQuery = useQuery({
    queryKey: ["action-center", "items"],
    queryFn: fetchActionCenterItems,
    enabled: !!employee && canAccessOverviewViews(employee.persona),
  });
  const items = itemsQuery.data?.items ?? [];
  const [openItem, setOpenItem] = useState<ActionItemDto | null>(null);

  // Notes reçues — accessible à tous les rôles, toujours affichée en haut
  // (29 août 2026, demande de l'utilisatrice), distincte du mécanisme
  // ActionItemDto ci-dessus : personnelle (par employé, pas par permission),
  // avec un bouton d'acquittement inline et un historique, pas un tiroir.
  const notesQuery = useQuery({ queryKey: ["team-notes", "inbox"], queryFn: fetchTeamNotesInbox });
  const activeNotes = notesQuery.data?.active ?? [];
  const recentArchivedNotes = notesQuery.data?.recentArchived ?? [];
  // Dérivé de l'URL à chaque rendu (pas un useState/useEffect séparé) —
  // Ajouter rapidement est un bouton global, accessible depuis N'IMPORTE
  // QUELLE page, y compris Centre d'actions lui-même. Cliquer "Envoyer une
  // note" alors qu'on y est déjà navigue vers la MÊME route : React Router
  // ne démonte jamais ce composant, donc un état initialisé une seule fois
  // au montage ne se redéclencherait jamais (bogue réel rapporté par
  // l'utilisatrice le 31 août 2026 : "parfois la fenêtre ne s'ouvre pas",
  // seulement depuis cette page). En dérivant directement de searchParams,
  // chaque navigation vers ?compose=note (même vers la page déjà montée)
  // rouvre fiablement la modale. Fermer retire le paramètre (replace, pas
  // d'entrée d'historique) — un clic ultérieur sur la même carte redevient
  // alors une valeur différente de l'URL courante, donc se redéclenche.
  const composeOpen = searchParams.get("compose") === "note";
  function closeCompose() {
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        next.delete("compose");
        return next;
      },
      { replace: true },
    );
  }
  const [showAllArchived, setShowAllArchived] = useState(false);
  const markReadMutation = useMutation({
    mutationFn: markTeamNoteRead,
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["team-notes"] }),
  });

  const groups = TYPE_ORDER.map((type) => ({ type, items: items.filter((item) => item.type === type) })).filter(
    (group) => group.items.length > 0,
  );

  return (
    <div>
      <div className="card" style={{ marginBottom: 20 }}>
        <div className="card-band-header">
          <h3>
            Notes reçues {activeNotes.length > 0 && <span className="cell-sub">({activeNotes.length})</span>}
          </h3>
        </div>
        {activeNotes.length === 0 && recentArchivedNotes.length === 0 && (
          <p style={{ color: "var(--gsc-color-muted)", fontSize: 13, margin: "12px 16px" }}>Aucune note pour l'instant.</p>
        )}
        {activeNotes.length > 0 && (
          <div className="action-item-list">
            {activeNotes.map((note: TeamNoteDto) => (
              <div key={note.id} className="action-item-row" style={{ cursor: "default" }}>
                <div className="action-item-main">
                  <span className="action-item-label">
                    {note.senderName} <span className="cell-sub">({PERSONA_LABELS[note.senderPersona]})</span>
                  </span>
                  <span className="action-item-sublabel">{note.body}</span>
                </div>
                <div className="action-item-side">
                  <span className="action-item-date">{formatDate(note.createdAt)}</span>
                  <button type="button" className="btn btn-small" disabled={markReadMutation.isPending} onClick={() => markReadMutation.mutate(note.id)}>
                    ✓ Reçu
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
        {recentArchivedNotes.length > 0 && (
          <div style={{ borderTop: "1px solid var(--gsc-color-border)", marginTop: activeNotes.length > 0 ? 8 : 0 }}>
            <div className="action-item-list">
              {recentArchivedNotes.map((note: TeamNoteDto) => (
                <div key={note.id} className="action-item-row" style={{ cursor: "default", opacity: 0.6 }}>
                  <div className="action-item-main">
                    <span className="action-item-label">{note.senderName}</span>
                    <span className="action-item-sublabel">{note.body}</span>
                  </div>
                  <span className="action-item-date">{formatDate(note.readAt ?? note.createdAt)}</span>
                </div>
              ))}
            </div>
            <div style={{ padding: "8px 16px 12px" }}>
              <button type="button" className="btn btn-secondary btn-small" onClick={() => setShowAllArchived(true)}>
                Afficher toutes les notes
              </button>
            </div>
          </div>
        )}
      </div>

      {itemsQuery.isError && (
        <div className="card">
          <p className="form-error">Impossible de charger le centre d'actions.</p>
        </div>
      )}

      {itemsQuery.isSuccess && groups.length === 0 && (
        <div className="card">
          <p style={{ color: "var(--gsc-color-muted)", fontSize: 13 }}>Rien à traiter pour l'instant.</p>
        </div>
      )}

      {groups.map((group, index) => (
        <div key={group.type} className="card" style={{ marginTop: index === 0 ? 0 : 20 }}>
          <div className="card-band-header">
            <h3>
              {group.items[0]?.typeLabel} <span className="cell-sub">({group.items.length})</span>
            </h3>
          </div>
          <div className="action-item-list">
            {group.items.map((item) =>
              hasActionDrawer(item.type) ? (
                <button key={item.id} type="button" className="action-item-row" onClick={() => setOpenItem(item)}>
                  <div className="action-item-main">
                    <span className="action-item-label">{item.label}</span>
                    <span className="action-item-sublabel">{item.sublabel}</span>
                  </div>
                  <div className="action-item-side">
                    {item.amount !== undefined && <span className="action-item-amount">{formatCurrency(item.amount)}</span>}
                    <span className="action-item-date">{formatDate(item.createdAt)}</span>
                  </div>
                </button>
              ) : (
                <Link key={item.id} to={linkFor(item)} className="action-item-row">
                  <div className="action-item-main">
                    <span className="action-item-label">{item.label}</span>
                    <span className="action-item-sublabel">{item.sublabel}</span>
                  </div>
                  <div className="action-item-side">
                    {item.amount !== undefined && <span className="action-item-amount">{formatCurrency(item.amount)}</span>}
                    <span className="action-item-date">{formatDate(item.createdAt)}</span>
                  </div>
                </Link>
              ),
            )}
          </div>
        </div>
      ))}

      {openItem?.type === "budget_approval" && <BudgetDetail id={openItem.id} onClose={() => setOpenItem(null)} />}
      {(openItem?.type === "client_request_new" || openItem?.type === "client_request_transmitted" || openItem?.type === "followup_due") && (
        <ClientRequestDetail id={openItem.id} onClose={() => setOpenItem(null)} />
      )}
      {openItem?.type === "purchase_approval" && <PurchaseRequestActionDrawer id={openItem.id} onClose={() => setOpenItem(null)} />}
      {openItem?.type === "purchase_to_order" && <PurchaseFulfillmentActionDrawer id={openItem.id} onClose={() => setOpenItem(null)} />}
      {openItem?.type === "invoicing" && <InvoiceDetailDrawer id={openItem.id} onClose={() => setOpenItem(null)} />}
      {openItem?.type === "hours_approval" && <TimeEntryActionDrawer id={openItem.id} onClose={() => setOpenItem(null)} />}

      {composeOpen && <SendNoteModal onClose={closeCompose} />}
      {showAllArchived && <AllArchivedNotesModal onClose={() => setShowAllArchived(false)} />}
    </div>
  );
}
