import { z } from "zod";
import { ROLES } from "@gsc-pilot/business-rules";

/**
 * NOUVEAU (pas un port) — premier schéma partagé entre apps/api et
 * apps/web. Reprend exactement les valeurs de persona définies dans
 * roles.ts (voir CLAUDE.md pour la mise en garde sur ce nommage).
 */
export const personaSchema = z.enum([ROLES.OWNER, ROLES.ADMIN, ROLES.BOSS, ROLES.MEMBER, ROLES.WAREHOUSE]);

export const employeeSchema = z.object({
  id: z.uuid(),
  authUserId: z.uuid().nullable(),
  name: z.string().min(1),
  initials: z.string().min(1).max(4),
  email: z.email(),
  phone: z.string().optional(),
  persona: personaSchema,
  jobTitle: z.string().optional(),
  skills: z.array(z.string()).default([]),
  skillEfficiencies: z.record(z.string(), z.number().min(0).max(200)).default({}),
  costRate: z.number().nonnegative(),
  techLevelId: z.uuid().nullable().default(null),
  active: z.boolean().default(true),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});

export type Employee = z.infer<typeof employeeSchema>;

/** Champs financiers d'Employee — jamais renvoyés à un Employé/Magasinier (voir canSeeFinancialValues dans roles.ts). */
export const EMPLOYEE_FINANCIAL_FIELDS = ["costRate"] as const;
