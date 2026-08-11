import { TOKENS } from "@gsc-pilot/shared";

function kebabCase(value: string): string {
  return value.replace(/([a-z0-9])([A-Z])/g, "$1-$2").toLowerCase();
}

/**
 * Applique les jetons de conception (packages/shared/src/design-tokens.ts,
 * eux-mêmes extraits tels quels de la v19 — voir CLAUDE.md) comme variables
 * CSS, plutôt que de les recopier en dur dans une feuille de style —
 * impossible qu'ils divergent de la source unique.
 */
export function applyDesignTokens(): void {
  const root = document.documentElement.style;
  root.setProperty("--gsc-font", TOKENS.font);
  for (const [key, value] of Object.entries(TOKENS.color)) {
    root.setProperty(`--gsc-color-${kebabCase(key)}`, value);
  }
  for (const [key, value] of Object.entries(TOKENS.radius)) {
    root.setProperty(`--gsc-radius-${key}`, value);
  }
  for (const [key, value] of Object.entries(TOKENS.shadow)) {
    root.setProperty(`--gsc-shadow-${key}`, value);
  }
  root.setProperty("--gsc-sidebar-width", TOKENS.layout.sidebarWidth);
  root.setProperty("--gsc-topbar-height", TOKENS.layout.topbarHeight);
}
