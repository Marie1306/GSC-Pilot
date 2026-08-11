import type { Request, Response, NextFunction } from "express";
import type { Persona } from "@gsc-pilot/business-rules";
import { verifyAccessToken } from "./supabase.js";
import { loadDelegationSettings } from "./delegation.js";
import { prisma } from "../db.js";
import type { Employee } from "../generated/prisma/client.js";

/** Authentification : jeton Supabase valide + fiche employé active correspondante. */
export async function requireAuth(req: Request, res: Response, next: NextFunction): Promise<void> {
  const header = req.headers.authorization;
  const token = header?.startsWith("Bearer ") ? header.slice(7) : null;
  if (!token) {
    res.status(401).json({ error: "unauthenticated" });
    return;
  }

  const supabaseUser = await verifyAccessToken(token);
  if (!supabaseUser) {
    res.status(401).json({ error: "unauthenticated" });
    return;
  }

  const employee = await prisma.employee.findUnique({ where: { authUserId: supabaseUser.id } });
  if (!employee || !employee.active) {
    res.status(401).json({ error: "unauthenticated" });
    return;
  }

  req.employee = employee;
  next();
}

export interface PermissionContext {
  employee: Employee;
}

/**
 * Autorisation : enveloppe une fonction de roles.ts SANS LA MODIFIER — la
 * même fonction sert ici (autorisation serveur, la seule qui compte
 * vraiment) et dans l'interface (RequireRole, blocage de navigation) —
 * les deux ne peuvent jamais diverger puisque c'est littéralement le même
 * code. Doit toujours être utilisé APRÈS requireAuth dans la chaîne de
 * middleware.
 */
export function requirePermission(check: (persona: Persona, ctx: PermissionContext) => boolean) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const employee = req.employee;
    if (!employee) {
      res.status(401).json({ error: "unauthenticated" });
      return;
    }
    if (!check(employee.persona, { employee })) {
      await prisma.auditLogEntry.create({
        data: {
          actorId: employee.id,
          actorPersona: employee.persona,
          action: "permission_denied",
          entityType: "route",
          entityId: req.originalUrl,
          meta: { method: req.method },
        },
      });
      res.status(403).json({ error: "forbidden" });
      return;
    }
    next();
  };
}

/**
 * Variante pour les permissions qui tiennent compte d'une délégation active
 * (canApproveProjectPurchase, canApprovePunch, ...) — charge la délégation
 * courante avant de vérifier, plutôt que de forcer chaque appelant à le
 * faire lui-même.
 */
export function requirePermissionWithDelegation(
  check: (settings: Awaited<ReturnType<typeof loadDelegationSettings>>, persona: Persona) => boolean,
) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const employee = req.employee;
    if (!employee) {
      res.status(401).json({ error: "unauthenticated" });
      return;
    }
    const settings = await loadDelegationSettings();
    if (!check(settings, employee.persona)) {
      await prisma.auditLogEntry.create({
        data: {
          actorId: employee.id,
          actorPersona: employee.persona,
          action: "permission_denied",
          entityType: "route",
          entityId: req.originalUrl,
          meta: { method: req.method },
        },
      });
      res.status(403).json({ error: "forbidden" });
      return;
    }
    next();
  };
}
