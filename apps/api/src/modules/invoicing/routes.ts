import { Router } from "express";
import { canCreateInvoiceRecord } from "@gsc-pilot/business-rules";
import { requireAuth, requirePermission } from "../../auth/middleware.js";
import { listInvoiceEntries } from "./service.js";

// Monté sur /api directement (voir app.ts) — chaque route applique donc
// requireAuth/requirePermission elle-même, jamais un .use() global sans
// chemin (voir settings/routes.ts pour le piège déjà documenté).
export const invoicingRouter = Router();

/** Même porte que la visibilité du menu (nav.ts) : Direction et Administration, Propriétaire explicitement exclu (spec confirmée). */
invoicingRouter.get("/invoicing/entries", requireAuth, requirePermission((persona) => canCreateInvoiceRecord(persona)), async (_req, res) => {
  const entries = await listInvoiceEntries();
  res.json({ entries });
});
