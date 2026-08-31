import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import {
  canCreateClientRequest,
  canCreateBudgetFromRequest,
  canCreateProjectDirectly,
  canCreateServiceCall,
  canCreateRollingDirectly,
  canAccessOverviewViews,
  canAccessErrorReports,
  type Persona,
} from "@gsc-pilot/business-rules";
import { fetchNextClientRequestNumber } from "../features/clientRequests/api.js";
import { fetchNextBudgetNumber } from "../features/budgets/api.js";
import { fetchNextProjectNumber } from "../features/projects/api.js";
import { fetchNextServiceCallNumber } from "../features/serviceCalls/api.js";
import "./quickAdd.css";

type NextNumberKind = "clientRequest" | "budget" | "project" | "serviceCall";

interface QuickAddCard {
  key: string;
  icon: string;
  label: string;
  path: string;
  allow: (persona: Persona) => boolean;
  /** Sous-titre statique (action sans numéro réel) — sinon nextNumber ci-dessous. */
  sub?: string;
  nextNumber?: NextNumberKind;
}

/**
 * Raccourcis de création (23 août 2026, demande explicite de l'utilisatrice
 * après comparaison avec v19 : « le bouton + visible de chacune des pages…
 * adapté selon les modules visibles pour chacun »). Chaque carte réutilise
 * la permission réelle qui gouverne déjà la route de création correspondante
 * — jamais une nouvelle règle inventée pour cette modale.
 *
 * Mise à jour du 31 août 2026 (demande explicite de l'utilisatrice : cliquer
 * une carte doit ouvrir directement la fenêtre contextuelle de création, pas
 * seulement atterrir sur la liste du module en laissant l'usager cliquer un
 * deuxième "+ Nouveau") : chaque carte "création d'un dossier" navigue avec
 * ?create=1, un signal que la page de destination lit pour ouvrir tout de
 * suite le même formulaire modal que son propre bouton "+ Nouveau" (même
 * mécanisme que ?compose=note ci-dessous, déjà en place). Punch/Entrée
 * manuelle distinguent plutôt laquelle des deux modales de TimePunchPage
 * ouvrir via ?quickadd=punch|manual, puisque les deux partagent la page /temps.
 *
 * Scanner un projet et Demande d'achat restent de simples navigations : la
 * première ouvre déjà directement la caméra, la seconde affiche déjà son
 * formulaire en premier sur la page — aucune fenêtre contextuelle à
 * déclencher en plus (confirmé avec l'utilisatrice).
 *
 * Livraison délibérément absente malgré v19 (BL-2026-0002) : aucune création
 * manuelle n'existe dans le vrai système — un bon de livraison est TOUJOURS
 * généré automatiquement depuis un projet/roulement (fulfillment, voir
 * projects/service.ts et rollings/service.ts) — construire cette carte
 * suggérerait une action qui n'existe pas.
 *
 * Roulement n'a délibérément aucun numéro (RL-2026-0002 dans v19 est
 * fictif) — confirmé ailleurs dans le code : « Un roulement n'a pas de
 * nom/numéro distinct — identifié par le client. »
 */
const CARDS: QuickAddCard[] = [
  { key: "client-request", icon: "📞", label: "Demande client", path: "/demandes?create=1", allow: canCreateClientRequest, nextNumber: "clientRequest" },
  { key: "budget", icon: "🧮", label: "Budgétaire", path: "/budgetaire?create=1", allow: canCreateBudgetFromRequest, nextNumber: "budget" },
  { key: "project", icon: "📁", label: "Projet", path: "/projets?create=1", allow: canCreateProjectDirectly, nextNumber: "project" },
  { key: "service-call", icon: "🔧", label: "Appel de service", path: "/appels-service?create=1", allow: canCreateServiceCall, nextNumber: "serviceCall" },
  { key: "rolling", icon: "🔁", label: "Roulement", path: "/roulements?create=1", allow: canCreateRollingDirectly, sub: "Identifié par le client" },
  { key: "punch", icon: "▶️", label: "Punch", path: "/temps?quickadd=punch", allow: () => true, sub: "Débuter une tâche" },
  { key: "manual-entry", icon: "🕒", label: "Entrée manuelle", path: "/temps?quickadd=manual", allow: () => true, sub: "Plusieurs tâches" },
  { key: "qr-scan", icon: "⬜", label: "Scanner un projet", path: "/scan", allow: () => true, sub: "Accès direct ou punch" },
  { key: "purchase", icon: "🛒", label: "Demande d'achat", path: "/achats", allow: () => true, sub: "Soumettre" },
  { key: "error-report", icon: "⚠️", label: "Rapport d'erreur", path: "/rapports-erreurs?create=1", allow: canAccessErrorReports, sub: "Nouveau rapport" },
  { key: "send-note", icon: "✉️", label: "Envoyer une note", path: "/centre-actions?compose=note", allow: () => true, sub: "Note interne" },
  { key: "contact", icon: "👥", label: "Contact", path: "/contacts?create=1", allow: canAccessOverviewViews, sub: "Client ou fournisseur" },
];

interface QuickAddProps {
  persona: Persona;
}

export function QuickAdd({ persona }: QuickAddProps) {
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();

  const visibleCards = CARDS.filter((card) => card.allow(persona));
  const needs = (kind: NextNumberKind) => open && visibleCards.some((card) => card.nextNumber === kind);

  const nextClientRequest = useQuery({ queryKey: ["next-number", "client-request"], queryFn: fetchNextClientRequestNumber, enabled: needs("clientRequest") });
  const nextBudget = useQuery({ queryKey: ["next-number", "budget"], queryFn: fetchNextBudgetNumber, enabled: needs("budget") });
  const nextProject = useQuery({ queryKey: ["next-number", "project"], queryFn: fetchNextProjectNumber, enabled: needs("project") });
  const nextServiceCall = useQuery({ queryKey: ["next-number", "service-call"], queryFn: fetchNextServiceCallNumber, enabled: needs("serviceCall") });

  function subtitleFor(card: QuickAddCard): string {
    if (card.sub) return card.sub;
    switch (card.nextNumber) {
      case "clientRequest":
        return nextClientRequest.data?.nextDisplayId ?? "…";
      case "budget":
        return nextBudget.data?.nextDisplayId ?? "…";
      case "project":
        return nextProject.data ? `Prochain no ${nextProject.data.nextProjectNumber}` : "…";
      case "serviceCall":
        return nextServiceCall.data?.nextDisplayId ?? "…";
      default:
        return "";
    }
  }

  if (visibleCards.length === 0) return null;

  return (
    <>
      {/* Croix en SVG plutôt que le caractère texte "+" (27 août 2026) — un
          glyphe de police n'est pas centré dans sa propre boîte de ligne
          (espace de descendante asymétrique), donc le centrage flexbox du
          bouton le laissait visuellement décalé selon la police système du
          téléphone (aucune police "Inter" réelle chargée, voir index.html —
          juste une valeur de repli). Un SVG n'a pas ce problème : sa boîte
          se centre pixel pour pixel, sur n'importe quel appareil. */}
      <button type="button" className="quickadd-fab" aria-label="Ajouter rapidement" onClick={() => setOpen(true)}>
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round">
          <line x1="12" y1="5" x2="12" y2="19" />
          <line x1="5" y1="12" x2="19" y2="12" />
        </svg>
      </button>

      {open && (
        <div className="modal-backdrop" onClick={() => setOpen(false)}>
          <div className="modal quickadd-modal" onClick={(event) => event.stopPropagation()}>
            <div className="modal-header">
              <div>
                <h2>Ajouter rapidement</h2>
                <p className="modal-subtitle">Choisissez une action autorisée pour votre rôle.</p>
              </div>
              <button type="button" className="modal-close" aria-label="Fermer" onClick={() => setOpen(false)}>
                ×
              </button>
            </div>
            <div className="modal-body">
              <div className="quickadd-grid">
                {visibleCards.map((card) => (
                  <button
                    key={card.key}
                    type="button"
                    className="quickadd-card"
                    onClick={() => {
                      setOpen(false);
                      navigate(card.path);
                    }}
                  >
                    <span className="quickadd-card-icon">{card.icon}</span>
                    <strong>{card.label}</strong>
                    <span className="cell-sub">{subtitleFor(card)}</span>
                  </button>
                ))}
              </div>
            </div>
            <div className="modal-footer">
              <button type="button" className="btn btn-secondary" onClick={() => setOpen(false)}>
                Fermer
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
