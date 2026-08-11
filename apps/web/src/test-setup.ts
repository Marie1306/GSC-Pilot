import "@testing-library/jest-dom/vitest";
import { afterEach } from "vitest";
import { cleanup } from "@testing-library/react";

// Pas de test.globals dans vitest.config.ts (imports explicites préférés) —
// le nettoyage automatique intégré de Testing Library ne se déclenche donc
// pas seul, on l'enregistre ici pour toute la suite.
afterEach(() => {
  cleanup();
});
