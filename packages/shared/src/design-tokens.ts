/**
 * GSC Pilot — Jetons de conception
 * Extraits directement de GSC_Pilot_Prototype_v19_2026-08-07.html (:root, ligne 19).
 * Confirmé le 8 août 2026 : v01 doit conserver la police, le visuel général
 * et les couleurs de la v19 telles quelles — rien inventé ci-dessous.
 *
 * Porté depuis docs/handoff/03-modules-v01/design-tokens.js — typage
 * ajouté uniquement, valeurs identiques (voir CLAUDE.md).
 */

export const TOKENS = Object.freeze({
  font: `Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`,

  color: Object.freeze({
    brand: "#e30613", // --gsc-red — couleur d'action principale (boutons, accents)
    brandDark: "#b7000a",
    brandSoft: "#fff0f1",
    ink: "#20242a", // texte principal
    muted: "#69707b",
    muted2: "#8a919d",
    line: "#e3e6ea",
    lineStrong: "#d2d7de",
    surface: "#ffffff",
    surface2: "#f7f8fa",
    surface3: "#eef0f3",
    bg: "#f2f4f6", // fond général de l'application (thème clair)
    green: "#12824b",
    greenSoft: "#e9f8f0",
    amber: "#b96b00",
    amberSoft: "#fff6e7",
    blue: "#1d64c8",
    blueSoft: "#ebf3ff",
    purple: "#6e4cc7",
    purpleSoft: "#f3efff",
    danger: "#c9212c",
    dangerSoft: "#fff0f1",
  }),

  radius: Object.freeze({ sm: "8px", base: "12px", lg: "18px" }),
  shadow: Object.freeze({
    sm: "0 1px 2px rgba(20,28,38,.05), 0 1px 4px rgba(20,28,38,.04)",
    md: "0 12px 34px rgba(25,34,46,.12)",
    lg: "0 24px 70px rgba(25,34,46,.22)",
  }),
  layout: Object.freeze({ sidebarWidth: "248px", topbarHeight: "74px" }),

  button: Object.freeze({
    // .btn — bouton principal : fond rouge de marque, texte blanc, gras
    minHeight: "39px",
    padding: "8px 13px",
    radius: "9px",
    fontWeight: 750,
  }),
});

export type DesignTokens = typeof TOKENS;
