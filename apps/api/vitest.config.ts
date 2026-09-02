import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["src/**/*.test.ts"],
    env: {
      // Valeurs fictices — suffisantes pour construire l'app et tester le
      // routage/l'autorisation sans dépendre d'une vraie base ou d'un vrai
      // projet Supabase (aucune route testée ici ne les contacte pour vrai).
      NODE_ENV: "test",
      DATABASE_URL: "postgresql://user:pass@localhost:5432/gscpilot_test",
      SUPABASE_URL: "https://example.supabase.co",
      SUPABASE_SERVICE_ROLE_KEY: "test-service-role-key",
      CORS_ORIGIN: "http://localhost:5173",
      APP_URL: "http://localhost:5173",
    },
  },
});
