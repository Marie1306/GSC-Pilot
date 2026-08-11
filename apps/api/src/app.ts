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
  app.use(express.json());
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
