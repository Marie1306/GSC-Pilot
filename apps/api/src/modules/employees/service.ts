import { canSeeFinancialValues, type Persona } from "@gsc-pilot/business-rules";
import { prisma } from "../../db.js";
import { supabaseAdmin } from "../../auth/supabase.js";
import { env } from "../../env.js";
import { HttpError } from "../../middleware/errorHandler.js";
import type { Employee } from "../../generated/prisma/client.js";

export interface EmployeeDto {
  id: string;
  name: string;
  initials: string;
  email: string;
  phone: string | null;
  persona: Persona;
  jobTitle: string | null;
  skills: string[];
  // { [skill]: pct } — Gantt seulement (voir Employee.skillEfficiencies,
  // schema.prisma) : jamais utilisé pour le budgétaire/les heures/le
  // post-mortem, module Gantt pas encore construit.
  skillEfficiencies: Record<string, number>;
  active: boolean;
  costRate?: number; // absent pour Employé/Magasinier — voir canSeeFinancialValues (roles.ts)
  // Classes facturables en service applicables à cet employé (voir
  // Employee.techLevels, confirmé le 18 août 2026 — plusieurs classes
  // possibles par personne, celle qui s'applique se choisit au punch).
  techLevelIds: string[];
}

function toSkillEfficiencies(value: unknown): Record<string, number> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([skill, pct]) => [skill, Number(pct) || 0]));
}

/**
 * Un seul endroit qui décide si costRate sort ou non de l'API — la règle
 * transversale « Employé et Magasinier ne voient jamais de valeur
 * monétaire » (spécification, section Permissions) s'applique aussi à leur
 * propre fiche, sans exception.
 *
 * `techLevelIds` est fourni séparément (pas via une relation Prisma incluse
 * d'office sur `employee`) pour ne pas alourdir chaque requête authentifiée
 * (middleware /me) d'une jointure dont elle n'a pas besoin — seule la route
 * /employees (Direction, Paramètres) l'inclut réellement.
 */
export function toEmployeeDto(employee: Employee, viewerPersona: Persona, techLevelIds: string[] = []): EmployeeDto {
  const dto: EmployeeDto = {
    id: employee.id,
    name: employee.name,
    initials: employee.initials,
    email: employee.email,
    phone: employee.phone,
    persona: employee.persona,
    jobTitle: employee.jobTitle,
    skills: employee.skills,
    skillEfficiencies: toSkillEfficiencies(employee.skillEfficiencies),
    active: employee.active,
    techLevelIds,
  };
  if (canSeeFinancialValues(viewerPersona)) {
    dto.costRate = Number(employee.costRate);
  }
  return dto;
}

export interface CreateEmployeeInput {
  name: string;
  initials: string;
  email: string;
  persona: Persona;
  phone?: string;
  jobTitle?: string;
  costRate?: number;
}

/**
 * Crée la fiche employé ET envoie l'invitation Supabase (auth.admin.
 * inviteUserByEmail) — confirmé dans le plan de fondation d'origine :
 * « Direction crée la fiche employé, Supabase envoie une invitation. »
 * L'id retourné par Supabase est lié IMMÉDIATEMENT à authUserId : requireAuth
 * (auth/middleware.ts) cherche l'employé par authUserId exact, sans aucun
 * repli par courriel au premier login — sans ce lien immédiat, l'invitation
 * acceptée ne permettrait jamais de se connecter.
 */
export async function createEmployee(input: CreateEmployeeInput, viewerPersona: Persona): Promise<EmployeeDto> {
  const existing = await prisma.employee.findUnique({ where: { email: input.email } });
  if (existing) throw new HttpError(409, "Un employé avec ce courriel existe déjà.");

  const { data, error } = await supabaseAdmin.auth.admin.inviteUserByEmail(input.email, {
    // Sans ça, Supabase retombe sur le "Site URL" du projet — resté sur
    // localhost depuis la configuration initiale en développement (bogue
    // réel trouvé le 2 septembre 2026 : un employé invité atterrissait sur
    // une page localhost inaccessible). Voir AcceptInvitePage.tsx pour la
    // page qui reçoit ce lien et fait définir le mot de passe.
    redirectTo: `${env.APP_URL}/accepter-invitation`,
  });
  if (error || !data.user) {
    throw new HttpError(400, `Impossible d'envoyer l'invitation Supabase : ${error?.message ?? "erreur inconnue"}.`);
  }

  const employee = await prisma.employee.create({
    data: {
      authUserId: data.user.id,
      name: input.name,
      initials: input.initials,
      email: input.email,
      phone: input.phone || null,
      persona: input.persona,
      jobTitle: input.jobTitle || null,
      costRate: input.costRate ?? 0,
    },
  });
  return toEmployeeDto(employee, viewerPersona, []);
}

export interface UpdateEmployeeInput {
  name?: string;
  jobTitle?: string | null;
  phone?: string | null;
  skills?: string[];
  skillEfficiencies?: Record<string, number>;
  costRate?: number;
  persona?: Persona;
  active?: boolean;
}

export async function updateEmployee(id: string, input: UpdateEmployeeInput, viewerPersona: Persona): Promise<EmployeeDto> {
  const employee = await prisma.employee.findUnique({ where: { id }, include: { techLevels: true } });
  if (!employee) throw new HttpError(404, "Employé introuvable.");

  const updated = await prisma.employee.update({
    where: { id },
    data: {
      ...(input.name !== undefined && { name: input.name }),
      ...(input.jobTitle !== undefined && { jobTitle: input.jobTitle }),
      ...(input.phone !== undefined && { phone: input.phone }),
      ...(input.skills !== undefined && { skills: input.skills }),
      ...(input.skillEfficiencies !== undefined && { skillEfficiencies: input.skillEfficiencies }),
      ...(input.costRate !== undefined && { costRate: input.costRate }),
      ...(input.persona !== undefined && { persona: input.persona }),
      ...(input.active !== undefined && { active: input.active }),
    },
    include: { techLevels: true },
  });
  return toEmployeeDto(updated, viewerPersona, updated.techLevels.map((techLevel) => techLevel.id));
}
