import { useAuth } from "../../lib/auth/useAuth.js";

const PERSONA_LABELS: Record<string, string> = {
  owner: "Direction",
  admin: "Administration",
  boss: "Propriétaire",
  member: "Employé",
  warehouse: "Magasinier",
};

/** Vue de synthèse personnalisée par utilisateur (spec confirmée) — contenu détaillé à construire par la suite. */
export function DashboardPage() {
  const { employee } = useAuth();
  return (
    <div className="card" style={{ maxWidth: 560 }}>
      <h1 style={{ marginTop: 0, fontSize: 20 }}>Bonjour, {employee?.name}</h1>
      <p style={{ color: "var(--gsc-color-muted)" }}>
        Connecté comme <strong>{employee ? (PERSONA_LABELS[employee.persona] ?? employee.persona) : ""}</strong>. Le tableau de bord
        détaillé (projets actifs, actions en attente, statistiques) arrive dans une prochaine phase.
      </p>
    </div>
  );
}
