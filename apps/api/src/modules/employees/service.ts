import { canSeeFinancialValues, type Persona } from "@gsc-pilot/business-rules";
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
  active: boolean;
  costRate?: number; // absent pour Employé/Magasinier — voir canSeeFinancialValues (roles.ts)
  // Classes facturables en service applicables à cet employé (voir
  // Employee.techLevels, confirmé le 18 août 2026 — plusieurs classes
  // possibles par personne, celle qui s'applique se choisit au punch).
  techLevelIds: string[];
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
    active: employee.active,
    techLevelIds,
  };
  if (canSeeFinancialValues(viewerPersona)) {
    dto.costRate = Number(employee.costRate);
  }
  return dto;
}
