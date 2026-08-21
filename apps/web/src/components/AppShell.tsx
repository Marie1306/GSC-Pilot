import { useState } from "react";
import { NavLink, Outlet } from "react-router-dom";
import { NAV_ITEMS, NAV_SECTION_LABELS, type NavItem, type NavSection } from "../lib/nav.js";
import { useAuth } from "../lib/auth/useAuth.js";
import { NavIcon } from "./NavIcons.js";
import "./AppShell.css";

const SECTION_ORDER: NavSection[] = ["overview", "sales", "operations", "admin"];

function groupBySection(items: NavItem[]): { section: NavSection; items: NavItem[] }[] {
  return SECTION_ORDER.map((section) => ({ section, items: items.filter((item) => item.section === section) })).filter(
    (group) => group.items.length > 0,
  );
}

interface NavListProps {
  groups: { section: NavSection; items: NavItem[] }[];
  onNavigate?: () => void;
}

function NavList({ groups, onNavigate }: NavListProps) {
  return (
    <>
      {groups.map((group) => (
        <div key={group.section} className="app-nav-group">
          <div className="app-nav-group-label">{NAV_SECTION_LABELS[group.section]}</div>
          {group.items.map((item) => (
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
            </NavLink>
          ))}
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
 */
export function AppShell() {
  const { employee, signOut } = useAuth();
  const [drawerOpen, setDrawerOpen] = useState(false);
  if (!employee) return null; // RequireRole, plus haut dans l'arbre de routes, garantit déjà sa présence ici

  const visibleItems = NAV_ITEMS.filter((item) => item.allow(employee.persona));
  const groups = groupBySection(visibleItems);

  return (
    <div className="app-shell">
      <aside className="app-sidebar">
        <div className="app-sidebar-brand">GSC Pilot</div>
        <nav className="app-sidebar-nav">
          <NavList groups={groups} />
        </nav>
      </aside>

      <div className="app-main">
        <header className="app-topbar">
          <button type="button" className="app-hamburger" aria-label="Ouvrir le menu" onClick={() => setDrawerOpen(true)}>
            <span />
            <span />
            <span />
          </button>
          <span className="app-topbar-title">GSC Pilot</span>
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
              <NavList groups={groups} onNavigate={() => setDrawerOpen(false)} />
            </nav>
          </aside>
        </div>
      )}
    </div>
  );
}
