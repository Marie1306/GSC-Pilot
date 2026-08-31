import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ROLES } from "@gsc-pilot/business-rules";
import type { Employee } from "@gsc-pilot/shared";
import { AuthContext, type AuthContextValue } from "../../lib/auth/AuthContext.js";
import { RollingsPage } from "./RollingsPage.js";

const direction: Employee = {
  id: "11111111-1111-1111-1111-111111111111",
  authUserId: "22222222-2222-2222-2222-222222222222",
  name: "Test Direction",
  initials: "TD",
  email: "test-direction@gscpilot.local",
  persona: ROLES.OWNER,
  skills: [],
  skillEfficiencies: {},
  costRate: 45,
  techLevelIds: [],
  active: true,
  createdAt: "2026-08-12T00:00:00.000Z",
  updatedAt: "2026-08-12T00:00:00.000Z",
};

function renderPage(employee: Employee) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const authValue: AuthContextValue = {
    session: null,
    employee,
    loading: false,
    error: null,
    signIn: async () => ({ error: null }),
    signOut: async () => {},
  };
  return render(
    <MemoryRouter initialEntries={["/roulements"]}>
      <QueryClientProvider client={queryClient}>
        <AuthContext.Provider value={authValue}>
          <Routes>
            <Route path="/roulements" element={<RollingsPage />} />
            <Route path="/budgetaire" element={<div>Page Budgétaire (destination)</div>} />
          </Routes>
        </AuthContext.Provider>
      </QueryClientProvider>
    </MemoryRouter>,
  );
}

/**
 * Le nudge "Construire un budgétaire à la place" à l'intérieur de "Nouveau
 * roulement" a été retiré (31 août 2026, demande explicite : « la création
 * du budgétaire d'un nouveau roulement doit se faire après la création de
 * celle-ci ») — la construction d'un budgétaire après coup se fait
 * maintenant depuis le menu Options du roulement déjà créé
 * (RollingOptionsMenu.tsx), jamais dans cette fenêtre de création directe.
 */
describe("RollingsPage — création directe, sans détour budgétaire", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        if (url.includes("/api/rollings")) return new Response(JSON.stringify({ rollings: [] }), { status: 200 });
        return new Response("{}", { status: 200 });
      }),
    );
  });

  it("« + Créer un roulement » ouvre directement le formulaire de contact, sans aucun bouton budgétaire", async () => {
    renderPage(direction);
    await waitFor(() => expect(screen.getByText("Aucun roulement pour l'instant.")).toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: "+ Créer un roulement" }));
    expect(screen.getByText("Nouveau roulement")).toBeInTheDocument();
    expect(screen.queryByText(/budgétaire/i)).not.toBeInTheDocument();
  });

  it("le formulaire de création directe reste fonctionnel", async () => {
    renderPage(direction);
    await waitFor(() => expect(screen.getByText("Aucun roulement pour l'instant.")).toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: "+ Créer un roulement" }));
    expect(screen.getByText(/Création directe : heures\/achats\/prix restent à zéro/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Créer" })).toBeInTheDocument();
  });

  it("cache « + Créer un roulement » pour Administration (canCreateRollingDirectly = Direction/Propriétaire seulement)", async () => {
    renderPage({ ...direction, persona: ROLES.ADMIN });
    await waitFor(() => expect(screen.getByText("Roulements")).toBeInTheDocument());
    expect(screen.queryByRole("button", { name: "+ Créer un roulement" })).not.toBeInTheDocument();
  });
});
