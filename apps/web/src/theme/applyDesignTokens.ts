import { TOKENS } from "@gsc-pilot/shared";

function kebabCase(value: string): string {
  return value.replace(/([a-z0-9])([A-Z])/g, "$1-$2").toLowerCase();
}

// Sondé une seule fois au chargement du module plutôt qu'à chaque appel —
// window.matchMedia renvoie un objet MediaQueryList vivant (son .matches se
// met à jour tout seul), pas un simple booléen figé.
const darkMediaQuery = typeof window !== "undefined" ? window.matchMedia("(prefers-color-scheme: dark)") : null;

/**
 * Couleurs seulement — police/rayons/ombres/disposition ne dépendent pas du
 * thème (voir applyDesignTokens ci-dessous). TOKENS.colorDark fusionné
 * PAR-DESSUS TOKENS.color (jamais un deuxième jeu de règles CSS séparé) :
 * une clé absente de colorDark (ex. inkFixed) garde donc automatiquement sa
 * valeur claire, toujours la même peu importe le thème.
 */
function applyColorPalette(isDark: boolean): void {
  const root = document.documentElement.style;
  const colors: Record<string, string> = isDark ? { ...TOKENS.color, ...TOKENS.colorDark } : TOKENS.color;
  for (const [key, value] of Object.entries(colors)) {
    root.setProperty(`--gsc-color-${kebabCase(key)}`, value);
  }
}

/**
 * Applique les jetons de conception (packages/shared/src/design-tokens.ts,
 * eux-mêmes extraits tels quels de la v19 — voir CLAUDE.md) comme variables
 * CSS, plutôt que de les recopier en dur dans une feuille de style —
 * impossible qu'ils divergent de la source unique.
 *
 * Mode sombre automatique (27 août 2026, demande explicite de
 * l'utilisatrice : « ça pourrait s'ajuster automatiquement selon le
 * téléphone ») — suit prefers-color-scheme du système, aucun interrupteur
 * manuel dans Paramètres. Ces jetons sont posés en style inline sur
 * document.documentElement (plus haute spécificité que n'importe quelle
 * règle CSS) — une media query CSS pure sur :root n'aurait donc aucun
 * effet, la bascule doit forcément passer par ce même mécanisme JS déjà en
 * place plutôt que par une deuxième feuille de style.
 */
export function applyDesignTokens(): void {
  const root = document.documentElement.style;
  root.setProperty("--gsc-font", TOKENS.font);
  applyColorPalette(darkMediaQuery?.matches ?? false);
  for (const [key, value] of Object.entries(TOKENS.radius)) {
    root.setProperty(`--gsc-radius-${key}`, value);
  }
  for (const [key, value] of Object.entries(TOKENS.shadow)) {
    root.setProperty(`--gsc-shadow-${key}`, value);
  }
  root.setProperty("--gsc-sidebar-width", TOKENS.layout.sidebarWidth);
  root.setProperty("--gsc-topbar-height", TOKENS.layout.topbarHeight);

  // Écran allumé pendant un changement de réglage système (ou de fuseau
  // clair/sombre programmé par le téléphone) : bascule en direct, sans
  // recharger la page.
  darkMediaQuery?.addEventListener("change", (event) => applyColorPalette(event.matches));
}
