import { useState } from "react";
import { NavLink, Outlet, useLocation } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { canAccessOverviewViews } from "@gsc-pilot/business-rules";
import { NAV_ITEMS, NAV_SECTION_LABELS, type NavItem, type NavSection } from "../lib/nav.js";
import { useAuth } from "../lib/auth/useAuth.js";
import { fetchActionCenterItems } from "../features/actionCenter/api.js";
import { NavIcon } from "./NavIcons.js";
import { QuickAdd } from "./QuickAdd.js";
import "./AppShell.css";

const SECTION_ORDER: NavSection[] = ["overview", "sales", "operations", "admin"];

function groupBySection(items: NavItem[]): { section: NavSection; items: NavItem[] }[] {
  return SECTION_ORDER.map((section) => ({ section, items: items.filter((item) => item.section === section) })).filter(
    (group) => group.items.length > 0,
  );
}

interface NavListProps {
  groups: { section: NavSection; items: NavItem[] }[];
  badges?: Partial<Record<string, number>>;
  onNavigate?: () => void;
}

function NavList({ groups, badges, onNavigate }: NavListProps) {
  return (
    <>
      {groups.map((group) => (
        <div key={group.section} className="app-nav-group">
          <div className="app-nav-group-label">{NAV_SECTION_LABELS[group.section]}</div>
          {group.items.map((item) => {
            const badgeCount = badges?.[item.key];
            return (
              <NavLink
                key={item.key}
                to={item.path}
                end={item.path === "/"}
                className={({ isActive }) => (isActive ? "active" : "")}
                onClick={onNavigate}
              >
                <span className="app-nav-icon">
                  <NavIcon name={item.key} />
                </span>
                {item.label}
                {!!badgeCount && <span className="app-nav-badge">{badgeCount}</span>}
              </NavLink>
            );
          })}
        </div>
      ))}
    </>
  );
}

/**
 * Une seule mise en page, qui s'adapte à l'écran — barre latérale groupée
 * (avec icônes, mêmes libellés/regroupement que la v19) sur PC, la MÊME
 * barre latérale en tiroir superposé sous ~880px (21 août 2026, remplace
 * l'ancienne barre de 5 boutons en bas — l'utilisatrice ne l'aimait pas).
 * Le titre de page dans la topbar (.app-topbar-titles) reste visible à
 * toutes les largeurs depuis le 26 août 2026 (disparaissait auparavant en
 * PC) ; la barre latérale fixe reste repliable sur PC via
 * .app-sidebar-toggle (sidebarCollapsed) pour libérer de l'espace, sans
 * jamais toucher au tiroir superposé mobile (drawerOpen).
 */
export function AppShell() {
  const { employee, signOut } = useAuth();
  const location = useLocation();
  const [drawerOpen, setDrawerOpen] = useState(false);
  // Repliable sur PC (26 août 2026, demandé par l'utilisatrice — le bandeau
  // de titre de page et cette bascule doivent tous les deux rester
  // accessibles en plein écran, ce qui n'était pas le cas avant). Distinct
  // de drawerOpen : ce dernier gère le tiroir superposé sous ~880px, jamais
  // touché ici.
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  // Hook toujours appelé (ordre stable) — activé seulement une fois
  // employee connu et éligible, jamais pour Employé/Magasinier (403 côté
  // serveur sinon, voir action-center/routes.ts).
  const actionCenterQuery = useQuery({
    queryKey: ["action-center", "items"],
    queryFn: fetchActionCenterItems,
    enabled: !!employee && canAccessOverviewViews(employee.persona),
    refetchInterval: 60_000,
  });
  if (!employee) return null; // RequireRole, plus haut dans l'arbre de routes, garantit déjà sa présence ici

  const visibleItems = NAV_ITEMS.filter((item) => item.allow(employee.persona));
  const groups = groupBySection(visibleItems);
  const badges = { "action-center": actionCenterQuery.data?.items.length ?? 0 };
  const activeItem = NAV_ITEMS.find((item) => item.path === location.pathname);

  return (
    <div className={sidebarCollapsed ? "app-shell sidebar-collapsed" : "app-shell"}>
      <aside className="app-sidebar">
        <div className="app-sidebar-brand">GSC Pilot</div>
        <nav className="app-sidebar-nav">
          <NavList groups={groups} badges={badges} />
        </nav>
      </aside>

      <div className="app-main">
        <header className="app-topbar">
          <button type="button" className="app-hamburger" aria-label="Ouvrir le menu" onClick={() => setDrawerOpen(true)}>
            <span />
            <span />
            <span />
          </button>
          <button
            type="button"
            className="app-sidebar-toggle"
            aria-label={sidebarCollapsed ? "Afficher le menu" : "Réduire le menu"}
            onClick={() => setSidebarCollapsed((current) => !current)}
          >
            <span />
            <span />
            <span />
          </button>
          <div className="app-topbar-titles">
            <span className="app-topbar-eyebrow">{activeItem ? NAV_SECTION_LABELS[activeItem.section] : "GSC Pilot"}</span>
            <span className="app-topbar-heading">{activeItem?.label ?? "GSC Pilot"}</span>
          </div>
          <div className="app-topbar-user">
            <span className="app-topbar-name">{employee.name}</span>
            <button type="button" className="btn btn-secondary" onClick={() => void signOut()}>
              Déconnexion
            </button>
          </div>
        </header>

        <main className="app-content">
          <Outlet />
        </main>
      </div>

      {drawerOpen && (
        <div className="app-drawer-backdrop" onClick={() => setDrawerOpen(false)}>
          <aside className="app-drawer" onClick={(event) => event.stopPropagation()}>
            <div className="app-drawer-header">
              <div className="app-sidebar-brand" style={{ border: "none", padding: 0, height: "auto" }}>
                GSC Pilot
              </div>
              <button type="button" className="modal-close" aria-label="Fermer le menu" onClick={() => setDrawerOpen(false)}>
                ×
              </button>
            </div>
            <nav className="app-sidebar-nav">
              <NavList groups={groups} badges={badges} onNavigate={() => setDrawerOpen(false)} />
            </nav>
          </aside>
        </div>
      )}

      <QuickAdd persona={employee.persona} />
    </div>
  );
}
