import { Router } from "express";
import { canAccessSettings } from "@gsc-pilot/business-rules";
import { requireAuth, requirePermission } from "../../auth/middleware.js";
import { prisma } from "../../db.js";
import { toEmployeeDto } from "./service.js";

export const employeesRouter = Router();

/** Première route qui prouve la chaîne d'authentification de bout en bout (Phase 1). */
employeesRouter.get("/me", requireAuth, (req, res) => {
  const employee = req.employee!;
  res.json({ employee: toEmployeeDto(employee, employee.persona) });
});

/**
 * Liste complète, avec taux horaires — Direction seulement (même porte que
 * la modification des taux, voir canAccessSettings/canModifyEmployeeRate
 * dans roles.ts). Un futur trombinoscope allégé (sans costRate, pour les
 * listes d'assignation) viendra avec scrubFinancials une fois les autres
 * modules construits — pas nécessaire pour cette première route.
 */
employeesRouter.get("/employees", requireAuth, requirePermission((persona) => canAccessSettings(persona)), async (req, res) => {
  const employees = await prisma.employee.findMany({ orderBy: { name: "asc" } });
  res.json({ employees: employees.map((employee) => toEmployeeDto(employee, req.employee!.persona)) });
});
