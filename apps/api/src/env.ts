import { z } from "zod";

try {
  process.loadEnvFile();
} catch {
  // .env absent — normal en production, où les variables viennent de l'hébergeur, pas d'un fichier.
}

const schema = z.object({
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  PORT: z.coerce.number().int().positive().default(3000),
  // Connexion groupée (pgbouncer côté Supabase) — utilisée par l'app en exécution.
  // La connexion directe (DIRECT_URL) ne sert qu'aux migrations, voir prisma.config.ts.
  DATABASE_URL: z.url(),
  SUPABASE_URL: z.url(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
  // Origines autorisées pour CORS, séparées par des virgules (ex. http://localhost:5173).
  CORS_ORIGIN: z.string().min(1),
  // URL publique de l'application (celle que voit un navigateur) — sert à
  // construire le lien de redirection des invitations Supabase
  // (inviteUserByEmail, employees/service.ts). Distincte de CORS_ORIGIN :
  // même valeur en production (une seule origine), mais un rôle différent.
  APP_URL: z.url(),
  // Modules SEAO / Boîte à outils (16 septembre 2026) — analyse de documents
  // et FAQ technique citée, voir apps/api/src/lib/ai/client.ts. Optionnelle
  // (contrairement à SUPABASE_SERVICE_ROLE_KEY/APP_URL, requises par
  // presque chaque requête) : SEULEMENT ces deux modules en dépendent, donc
  // son absence ne doit jamais empêcher tout le reste de l'application de
  // démarrer — corrigé le 16 septembre 2026 après un déploiement Render
  // cassé au démarrage faute de cette variable (voir CLAUDE.md). Les routes
  // SEAO/Boîte à outils qui appellent réellement l'IA échouent proprement
  // (503, voir lib/ai/client.ts assertAnthropicConfigured) tant qu'elle
  // n'est pas ajoutée dans Render.
  ANTHROPIC_API_KEY: z.string().min(1).optional(),
});

const parsed = schema.safeParse(process.env);
if (!parsed.success) {
  console.error("Variables d'environnement invalides ou manquantes :");
  console.error(z.prettifyError(parsed.error));
  process.exit(1);
}

export const env = parsed.data;
export const CORS_ORIGINS = env.CORS_ORIGIN.split(",").map((origin) => origin.trim());
