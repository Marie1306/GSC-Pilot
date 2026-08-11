import { z } from "zod";
import { employeeSchema } from "./employee.js";

/** NOUVEAU — réponse de GET /me, la toute première route qui prouve la chaîne d'authentification de bout en bout (Phase 1). */
export const meResponseSchema = z.object({
  employee: employeeSchema,
});

export type MeResponse = z.infer<typeof meResponseSchema>;
