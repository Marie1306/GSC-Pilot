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
      workbox: {
        // Les routes d'export PDF (*/export, 6 vues — Budgétaire/Post-mortem/
        // Livraison/Call de service/Soumission/Confirmation de commande)
        // n'ont aucun usage hors ligne légitime (données réelles requises à
        // chaque fois) et s'ouvrent toujours dans un NOUVEL onglet
        // (window.open) — donc toujours une navigation fraîche, jamais
        // depuis l'app déjà ouverte. Exclues explicitement du fallback SPA
        // du service worker (15 novembre 2026, enquête sur des PDF
        // imprimés "tout blanc", rapportés par Marie sur Budgétaire ET
        // Soumission) pour éliminer toute chance qu'un onglet d'export
        // reçoive un index.html/bundle JS périmé resservi par le cache du
        // service worker plutôt que d'aller chercher la version courante
        // au réseau.
        navigateFallbackDenylist: [/\/export$/],
      },
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
