import "@testing-library/jest-dom/vitest";
// jsdom n'inclut pas IndexedDB — nécessaire pour packages/../offline/db.ts (Dexie), sinon rejets non gérés dans tout test qui monte une page l'important.
import "fake-indexeddb/auto";
import { afterEach } from "vitest";
import { cleanup } from "@testing-library/react";

// Pas de test.globals dans vitest.config.ts (imports explicites préférés) —
// le nettoyage automatique intégré de Testing Library ne se déclenche donc
// pas seul, on l'enregistre ici pour toute la suite.
afterEach(() => {
  cleanup();
});
