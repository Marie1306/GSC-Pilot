import express from "express";
import cors from "cors";
import helmet from "helmet";
import { pinoHttp } from "pino-http";
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { env, CORS_ORIGINS } from "./env.js";
import { apiRateLimit } from "./middleware/rateLimit.js";
import { errorHandler } from "./middleware/errorHandler.js";
import { healthRouter } from "./modules/health/routes.js";
import { employeesRouter } from "./modules/employees/routes.js";
import { purchasesRouter } from "./modules/purchases/routes.js";
import { projectsRouter } from "./modules/projects/routes.js";
import { settingsRouter } from "./modules/settings/routes.js";
import { clientRequestsRouter } from "./modules/clientRequests/routes.js";
import { budgetsRouter } from "./modules/budgets/routes.js";
import { timeEntriesRouter } from "./modules/timeEntries/routes.js";
import { serviceCallsRouter } from "./modules/serviceCalls/routes.js";
import { contactsRouter } from "./modules/contacts/routes.js";
import { invoicingRouter } from "./modules/invoicing/routes.js";
import { deliveriesRouter } from "./modules/deliveries/routes.js";
import { reportsRouter } from "./modules/reports/routes.js";
import { rollingsRouter } from "./modules/rollings/routes.js";
import { dashboardRouter } from "./modules/dashboard/routes.js";
import { actionCenterRouter } from "./modules/actionCenter/routes.js";
import { subassembliesRouter } from "./modules/subassemblies/routes.js";
import { amendmentsRouter } from "./modules/amendments/routes.js";
import { ganttRouter } from "./modules/gantt/routes.js";
import { interruptionsRouter } from "./modules/interruptions/routes.js";
import { checklistsRouter } from "./modules/checklists/routes.js";
import { errorReportsRouter } from "./modules/errorReports/routes.js";
import { teamNotesRouter } from "./modules/teamNotes/routes.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export function createApp() {
  const app = express();

  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          ...helmet.contentSecurityPolicy.getDefaultDirectives(),
          // L'interface appelle Supabase Auth directement depuis le
          // navigateur (connexion, session) — sans ça, la CSP par défaut
          // (connect-src replié sur default-src 'self') bloque ces appels.
          "connect-src": ["'self'", env.SUPABASE_URL],
        },
      },
    }),
  );
  app.use(
    cors({
      origin: CORS_ORIGINS,
      credentials: true,
    }),
  );
  // Limite par défaut d'Express (100kb) trop petite pour les photos en
  // base64 (Rapport d'erreurs, ErrorReportPhoto.imageDataUrl — bogue réel
  // rapporté par l'utilisatrice le 28 août 2026 : "internal_error" à
  // l'ajout d'une photo, causé par un PayloadTooLargeError générique non
  // distingué de errorHandler.ts). Une seule photo compressée
  // (readAndCompressImage.ts, 1280px/JPEG 0.8) dépasse déjà souvent 100kb
  // une fois encodée en base64 (+33%) — 15mb laisse une vraie marge pour
  // plusieurs photos par rapport.
  app.use(express.json({ limit: "15mb" }));
  app.use(
    pinoHttp({
      level: env.NODE_ENV === "production" ? "info" : "debug",
      // Ne jamais journaliser les jetons d'authentification.
      redact: ["req.headers.authorization"],
    }),
  );
  app.use(apiRateLimit);

  app.use(healthRouter);
  app.use("/api", employeesRouter);
  app.use("/api", purchasesRouter);
  app.use("/api", projectsRouter);
  app.use("/api", clientRequestsRouter);
  app.use("/api", budgetsRouter);
  app.use("/api", timeEntriesRouter);
  app.use("/api", serviceCallsRouter);
  app.use("/api", contactsRouter);
  app.use("/api", invoicingRouter);
  app.use("/api", deliveriesRouter);
  app.use("/api", reportsRouter);
  app.use("/api", rollingsRouter);
  app.use("/api", dashboardRouter);
  app.use("/api", actionCenterRouter);
  app.use("/api", subassembliesRouter);
  app.use("/api", amendmentsRouter);
  app.use("/api", ganttRouter);
  app.use("/api", interruptionsRouter);
  app.use("/api", checklistsRouter);
  app.use("/api", errorReportsRouter);
  app.use("/api", teamNotesRouter);
  app.use("/api/settings", settingsRouter);

  // En production, l'API sert aussi le build statique de apps/web (un seul
  // hôte, une seule URL, aucun CORS à configurer) — voir CLAUDE.md /
  // README. Ignoré tant que apps/web n'a pas encore de build (Phase 1).
  const webDist = path.join(__dirname, "../../web/dist");
  if (env.NODE_ENV === "production" && fs.existsSync(webDist)) {
    app.use(express.static(webDist));
    app.get(/(.*)/, (_req, res) => {
      res.sendFile(path.join(webDist, "index.html"));
    });
  }

  app.use((req, res) => {
    res.status(404).json({ error: "not_found" });
  });

  app.use(errorHandler);

  return app;
}
