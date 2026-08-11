import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

// Hors ligne limité à 3 tâches de terrain (punch, scan QR, appel de
// service) — voir src/offline/. Le service worker généré ici précache
// seulement la coquille de l'app (JS/CSS/icônes), jamais les données —
// chaque fonctionnalité décide elle-même de son comportement hors ligne.
export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["icons/icon-192.png", "icons/icon-512.png"],
      manifest: {
        name: "GSC Pilot",
        short_name: "GSC Pilot",
        description: "Gestion interne — GSC Automation",
        theme_color: "#e30613",
        background_color: "#f2f4f6",
        display: "standalone",
        start_url: "/",
        scope: "/",
        icons: [
          { src: "icons/icon-192.png", sizes: "192x192", type: "image/png" },
          { src: "icons/icon-512.png", sizes: "512x512", type: "image/png" },
          { src: "icons/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
        ],
      },
    }),
  ],
  server: {
    proxy: {
      "/api": "http://localhost:3000",
      "/health": "http://localhost:3000",
    },
  },
});
