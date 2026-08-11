/**
 * GSC Pilot v01 — Jetons de conception
 * Extraits directement de GSC_Pilot_Prototype_v19_2026-08-07.html (:root, ligne 19).
 * Confirmé le 8 août 2026 : v01 doit conserver la police, le visuel général
 * et les couleurs de la v19 telles quelles — rien inventé ci-dessous.
 *
 * Note : les deux démos construites plus tôt (index.html, roles-demo.html)
 * utilisaient une palette différente, choisie avant cette confirmation —
 * elles restent valides comme preuves de logique, mais leur habillage
 * visuel n'est pas représentatif de la vraie v01.
 */

export const TOKENS = Object.freeze({
  font: `Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`,

  color: {
    brand: "#e30613",       // --gsc-red — couleur d'action principale (boutons, accents)
    brandDark: "#b7000a",
    brandSoft: "#fff0f1",
    ink: "#20242a",          // texte principal
    muted: "#69707b",
    muted2: "#8a919d",
    line: "#e3e6ea",
    lineStrong: "#d2d7de",
    surface: "#ffffff",
    surface2: "#f7f8fa",
    surface3: "#eef0f3",
    bg: "#f2f4f6",            // fond général de l'application (thème clair)
    green: "#12824b", greenSoft: "#e9f8f0",
    amber: "#b96b00", amberSoft: "#fff6e7",
    blue: "#1d64c8", blueSoft: "#ebf3ff",
    purple: "#6e4cc7", purpleSoft: "#f3efff",
    danger: "#c9212c", dangerSoft: "#fff0f1",
  },

  radius: { sm: "8px", base: "12px", lg: "18px" },
  shadow: {
    sm: "0 1px 2px rgba(20,28,38,.05), 0 1px 4px rgba(20,28,38,.04)",
    md: "0 12px 34px rgba(25,34,46,.12)",
    lg: "0 24px 70px rgba(25,34,46,.22)",
  },
  layout: { sidebarWidth: "248px", topbarHeight: "74px" },

  button: {
    // .btn — bouton principal : fond rouge de marque, texte blanc, gras
    minHeight: "39px", padding: "8px 13px", radius: "9px", fontWeight: 750,
  },
});
