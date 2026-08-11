import { NavLink, Outlet } from "react-router-dom";
import { NAV_ITEMS } from "../lib/nav.js";
import { useAuth } from "../lib/auth/useAuth.js";
import "./AppShell.css";

/**
 * Une seule mise en page, qui s'adapte à l'écran (barre latérale complète
 * sur PC, menu simplifié à gros boutons sur mobile) — pas deux programmes
 * séparés, comme confirmé dans l'architecture (voir docs/handoff/01-architecture).
 */
export function AppShell() {
  const { employee, signOut } = useAuth();
  if (!employee) return null; // RequireRole, plus haut dans l'arbre de routes, garantit déjà sa présence ici

  const visibleItems = NAV_ITEMS.filter((item) => item.allow(employee.persona));
  const mobileItems = visibleItems.slice(0, 5); // gros boutons = espace limité, on garde l'essentiel

  return (
    <div className="app-shell">
      <aside className="app-sidebar">
        <div className="app-sidebar-brand">GSC Pilot</div>
        <nav className="app-sidebar-nav">
          {visibleItems.map((item) => (
            <NavLink key={item.key} to={item.path} end={item.path === "/"} className={({ isActive }) => (isActive ? "active" : "")}>
              {item.label}
            </NavLink>
          ))}
        </nav>
      </aside>

      <div className="app-main">
        <header className="app-topbar">
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

        <nav className="app-mobile-nav">
          {mobileItems.map((item) => (
            <NavLink key={item.key} to={item.path} end={item.path === "/"} className={({ isActive }) => (isActive ? "active" : "")}>
              {item.label}
            </NavLink>
          ))}
        </nav>
      </div>
    </div>
  );
}
