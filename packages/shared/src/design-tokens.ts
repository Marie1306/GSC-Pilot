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
    // Identique à `ink` en valeur, mais volontairement SÉPARÉ (27 août
    // 2026, mode sombre) : `ink` doit pouvoir s'inverser en mode sombre
    // (texte clair sur fond sombre), alors que plusieurs surfaces étaient
    // déjà délibérément sombres AVANT le mode sombre et doivent le rester
    // peu importe le thème — barre latérale/tiroir mobile (AppShell.css),
    // bandeaux d'en-tête de carte (.card-band-header/.project-card-header,
    // theme.css) et carte chronomètre (.punch-hero, timePunch.css), qui
    // réutilisaient `ink` comme fond simplement parce que c'était déjà la
    // teinte la plus sombre disponible. N'a PAS d'équivalent dans
    // colorDark ci-dessous — reste donc toujours cette valeur.
    inkFixed: "#20242a",
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

  /**
   * Mode sombre automatique (27 août 2026, demande explicite de
   * l'utilisatrice — suit prefers-color-scheme du système, aucun
   * interrupteur manuel). Mêmes clés que `color` ci-dessus, sauf deux
   * absences volontaires — appliqué en fusion par-dessus `color` dans
   * applyDesignTokens.ts, jamais un deuxième jeu de règles CSS séparé :
   *
   * - `inkFixed` : voir son commentaire, toujours la même valeur.
   * - `brand`/`brandDark` : mesuré (contraste WCAG réel, pas deviné) que
   *   les éclaircir pour améliorer le texte-sur-fond-sombre (ex. numéro de
   *   projet sur bandeau, 3.2→4.6:1) DÉGRADE le cas plus fréquent/visible
   *   du texte BLANC sur fond rouge (nav active, boutons, bulle Ajouter
   *   rapidement) : 4.88:1 → 3.36:1, sous le seuil AA texte normal (4.5:1)
   *   pour ces libellés (14px gras, pas assez grand pour la tolérance
   *   "texte large"). Un seul jeton ne peut pas satisfaire les deux rôles
   *   à la fois — gardés inchangés (déjà le cas, non régressé) plutôt que
   *   de créer une régression sur le cas le plus visible pour améliorer un
   *   cas déjà borderline en clair aussi (jamais signalé comme problème).
   */
  colorDark: Object.freeze({
    brandSoft: "#3a1417",
    ink: "#eceef1",
    muted: "#9aa1ac",
    muted2: "#767d89",
    line: "#2b2f38",
    lineStrong: "#3a3f4a",
    surface: "#1c1f26",
    surface2: "#242830",
    surface3: "#2d323d",
    bg: "#121417",
    green: "#3ddc84",
    greenSoft: "#12291d",
    amber: "#e6a53c",
    amberSoft: "#33260e",
    blue: "#5b9df5",
    blueSoft: "#152a42",
    purple: "#b294f0",
    purpleSoft: "#28203e",
    danger: "#ff6b6b",
    dangerSoft: "#3a1417",
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
