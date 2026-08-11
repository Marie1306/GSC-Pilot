import type { ReactNode } from "react";
import { Navigate } from "react-router-dom";
import type { Persona } from "@gsc-pilot/business-rules";
import { useAuth } from "./useAuth.js";

/**
 * Vérifiée à chaque navigation (URL tapée, retour arrière, lien direct) —
 * pas seulement à l'affichage initial du menu. Réutilise la même fonction
 * de roles.ts que le serveur (voir apps/api) : la navigation peut cacher,
 * mais c'est le serveur qui bloque réellement, jamais l'inverse.
 */
export function RequireRole({ allow, children }: { allow: (persona: Persona) => boolean; children: ReactNode }) {
  const { employee, loading, error } = useAuth();

  if (loading) return <div className="loading-shell">Chargement…</div>;
  if (error) return <div className="loading-shell">{error}</div>;
  if (!employee) return <Navigate to="/connexion" replace />;
  if (!allow(employee.persona)) return <Navigate to="/" replace />;

  return <>{children}</>;
}
