import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "jsdom",
    setupFiles: ["./src/test-setup.ts"],
    include: ["src/**/*.test.{ts,tsx}"],
    env: {
      // Valeurs fictices — suffisantes pour construire supabaseClient.ts sans
      // faire de vraie requête réseau (getSession() lit l'état local, aucune
      // session n'existe jamais dans les tests).
      VITE_SUPABASE_URL: "https://example.supabase.co",
      VITE_SUPABASE_ANON_KEY: "test-anon-key",
    },
  },
});
