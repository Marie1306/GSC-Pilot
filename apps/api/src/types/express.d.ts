import type { Employee } from "../generated/prisma/client.js";

declare global {
  namespace Express {
    interface Request {
      /** Peuplé par requireAuth — la fiche employé correspondant au jeton Supabase vérifié. */
      employee?: Employee;
    }
  }
}

export {};
