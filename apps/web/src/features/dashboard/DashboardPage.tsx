import { useQuery } from "@tanstack/react-query";
import { useAuth } from "../../lib/auth/useAuth.js";
import { fetchDashboardSummary } from "./api.js";

const PERSONA_LABELS: Record<string, string> = {
  owner: "Direction",
  admin: "Administration",
  boss: "Propriétaire",
  member: "Employé",
  warehouse: "Magasinier",
};

interface Tile {
  label: string;
  value: number | string;
}

/**
 * Vue de synthèse personnalisée par utilisateur (spec confirmée, 21 août
 * 2026) — première étape volontairement simple avant le Centre d'actions
 * (plus gros morceau, à venir) : quelques compteurs réels par rôle, réutilisés
 * d'autres modules (voir dashboard/service.ts, backend), jamais une
 * deuxième liste d'actions à traiter ici.
 */
export function DashboardPage() {
  const { employee } = useAuth();
  const summaryQuery = useQuery({ queryKey: ["dashboard", "summary"], queryFn: fetchDashboardSummary });
  const summary = summaryQuery.data?.summary;

  if (!employee) return null;

  const tiles: Tile[] = [];
  if (summary?.activeProjectsCount !== undefined) {
    tiles.push({ label: "Projets actifs", value: summary.activeProjectsCount });
  }
  if (summary?.activeRollingsCount !== undefined) {
    tiles.push({ label: "Roulements actifs", value: summary.activeRollingsCount });
  }
  if (summary?.budgetsInProgressCount !== undefined) {
    tiles.push({ label: "Budgétaires en cours", value: summary.budgetsInProgressCount });
  }
  if (summary?.invoicingToProcessCount !== undefined) {
    tiles.push({ label: "Facturation à traiter", value: summary.invoicingToProcessCount });
  }
  if (summary) {
    tiles.push({ label: "Mes heures cette semaine", value: `${summary.myWeekHours} h` });
    tiles.push({ label: "Mes entrées en attente", value: summary.myPendingEntriesCount });
  }
  if (summary?.myAssignedDeliveriesCount !== undefined) {
    tiles.push({ label: "Mes livraisons à faire", value: summary.myAssignedDeliveriesCount });
  }

  return (
    <div>
      <div className="card">
        <h1 style={{ marginTop: 0, fontSize: 20 }}>Bonjour, {employee.name}</h1>
        <p style={{ color: "var(--gsc-color-muted)", margin: 0 }}>
          Connecté comme <strong>{PERSONA_LABELS[employee.persona] ?? employee.persona}</strong>.
        </p>
      </div>

      <div className="card" style={{ marginTop: 20 }}>
        {summaryQuery.isError ? (
          <p className="form-error">Impossible de charger le tableau de bord.</p>
        ) : !summary ? (
          <p style={{ color: "var(--gsc-color-muted)", fontSize: 13 }}>Chargement…</p>
        ) : (
          <div className="stat-tile-grid">
            {tiles.map((tile) => (
              <div key={tile.label} className="stat-tile">
                <span className="stat-tile-label">{tile.label}</span>
                <span className="stat-tile-value">{tile.value}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
