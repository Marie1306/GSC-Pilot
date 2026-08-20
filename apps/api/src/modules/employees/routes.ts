import { Router } from "express";
import { z } from "zod";
import { canAccessSettings, ROLES } from "@gsc-pilot/business-rules";
import { requireAuth, requirePermission } from "../../auth/middleware.js";
import { prisma } from "../../db.js";
import { HttpError } from "../../middleware/errorHandler.js";
import { toEmployeeDto, createEmployee, updateEmployee } from "./service.js";

const PERSONAS = [ROLES.OWNER, ROLES.ADMIN, ROLES.BOSS, ROLES.MEMBER, ROLES.WAREHOUSE] as const;

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

const createEmployeeSchema = z.object({
  name: z.string().min(1, "Le nom est requis."),
  initials: z.string().min(1, "Les initiales sont requises."),
  email: z.email("Courriel invalide."),
  persona: z.enum(PERSONAS),
  phone: z.string().optional(),
  jobTitle: z.string().optional(),
  costRate: z.number().nonnegative().optional(),
});
/**
 * Création + invitation Supabase (voir createEmployee, service.ts) — Direction
 * seulement, même porte que le reste de Paramètres.
 */
employeesRouter.post("/employees", requireAuth, requirePermission((persona) => canAccessSettings(persona)), async (req, res) => {
  const body = createEmployeeSchema.parse(req.body);
  const employee = await createEmployee(body, req.employee!.persona);
  res.status(201).json({ employee });
});

const updateEmployeeSchema = z.object({
  name: z.string().min(1).optional(),
  jobTitle: z.string().nullable().optional(),
  phone: z.string().nullable().optional(),
  skills: z.array(z.string()).optional(),
  skillEfficiencies: z.record(z.string(), z.number()).optional(),
  costRate: z.number().nonnegative().optional(),
  persona: z.enum(PERSONAS).optional(),
  active: z.boolean().optional(),
});
employeesRouter.patch("/employees/:id", requireAuth, requirePermission((persona) => canAccessSettings(persona)), async (req, res) => {
  const id = z.uuid().parse(req.params.id);
  const body = updateEmployeeSchema.parse(req.body);
  const employee = await updateEmployee(id, body, req.employee!.persona);
  res.json({ employee });
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
