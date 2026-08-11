// Config Prisma 7 (CLI — migrations, generate, studio). L'exécution de
// l'app elle-même (src/db.ts) construit son propre adaptateur, séparément.
import { defineConfig } from "prisma/config";

try {
  process.loadEnvFile(); // charge .env s'il existe — absent en production, où les variables viennent de l'hébergeur
} catch {
  // .env absent (ex. en production) — normal, les variables viennent alors de l'environnement d'hébergement
}

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    // DIRECT_URL, pas DATABASE_URL : les migrations doivent contourner le
    // pooler (pgbouncer) de Supabase — connexion directe requise pour les
    // opérations DDL et les verrous de session.
    url: process.env.DIRECT_URL,
  },
});
