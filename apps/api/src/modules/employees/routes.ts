import { Router } from "express";
import { z } from "zod";
import { canAccessSettings } from "@gsc-pilot/business-rules";
import { requireAuth, requirePermission } from "../../auth/middleware.js";
import { prisma } from "../../db.js";
import { HttpError } from "../../middleware/errorHandler.js";
import { toEmployeeDto } from "./service.js";

export const employeesRouter = Router();

/** Première route qui prouve la chaîne d'authentification de bout en bout (Phase 1). */
employeesRouter.get("/me", requireAuth, async (req, res) => {
  const employee = req.employee!;
  // Requête supplémentaire seulement ici (pas dans requireAuth, appelé à
  // chaque route) — nécessaire pour que l'employé connaisse ses propres
  // classes facturables en service (voir modules/timeEntries).
  const techLevels = await prisma.techLevel.findMany({ where: { employees: { some: { id: employee.id } } } });
  res.json({ employee: toEmployeeDto(employee, employee.persona, techLevels.map((techLevel) => techLevel.id)) });
});

/**
 * Liste complète, avec taux horaires — Direction seulement (même porte que
 * la modification des taux, voir canAccessSettings/canModifyEmployeeRate
 * dans roles.ts). Un futur trombinoscope allégé (sans costRate, pour les
 * listes d'assignation) viendra avec scrubFinancials une fois les autres
 * modules construits — pas nécessaire pour cette première route.
 */
employeesRouter.get("/employees", requireAuth, requirePermission((persona) => canAccessSettings(persona)), async (req, res) => {
  const employees = await prisma.employee.findMany({ orderBy: { name: "asc" }, include: { techLevels: true } });
  res.json({
    employees: employees.map((employee) =>
      toEmployeeDto(employee, req.employee!.persona, employee.techLevels.map((techLevel) => techLevel.id)),
    ),
  });
});

const techLevelsSchema = z.object({ techLevelIds: z.array(z.uuid()) });
/**
 * Assigner les classes facturables en service applicables à un employé
 * (confirmé le 18 août 2026 — plusieurs classes possibles par personne,
 * celle qui s'applique se choisit au punch). Même porte que la liste
 * ci-dessus — Direction seulement.
 */
employeesRouter.patch(
  "/employees/:id/tech-levels",
  requireAuth,
  requirePermission((persona) => canAccessSettings(persona)),
  async (req, res) => {
    const id = z.uuid().parse(req.params.id);
    const { techLevelIds } = techLevelsSchema.parse(req.body);
    const employee = await prisma.employee.findUnique({ where: { id } });
    if (!employee) throw new HttpError(404, "Employé introuvable.");
    const updated = await prisma.employee.update({
      where: { id },
      data: { techLevels: { set: techLevelIds.map((techLevelId) => ({ id: techLevelId })) } },
      include: { techLevels: true },
    });
    res.json({ employee: toEmployeeDto(updated, req.employee!.persona, updated.techLevels.map((techLevel) => techLevel.id)) });
  },
);
