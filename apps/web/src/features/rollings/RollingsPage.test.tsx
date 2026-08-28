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

describe("RollingsPage — lien vers la création d'un budgétaire", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        if (url.includes("/api/rollings")) return new Response(JSON.stringify({ rollings: [] }), { status: 200 });
        return new Response("{}", { status: 200 });
      }),
    );
  });

  it("affiche « Créer un budgétaire » à côté de « Créer un roulement » pour Direction", async () => {
    renderPage(direction);
    await waitFor(() => expect(screen.getByText("Aucun roulement pour l'instant.")).toBeInTheDocument());
    expect(screen.getByRole("button", { name: "🧮 Créer un budgétaire" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "+ Créer un roulement" })).toBeInTheDocument();
  });

  it("navigue vers /budgetaire au clic sur « Créer un budgétaire »", async () => {
    renderPage(direction);
    await waitFor(() => expect(screen.getByText("Aucun roulement pour l'instant.")).toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: "🧮 Créer un budgétaire" }));
    expect(await screen.findByText("Page Budgétaire (destination)")).toBeInTheDocument();
  });

  it("le formulaire de création directe reste fonctionnel (+ Créer un roulement)", async () => {
    renderPage(direction);
    await waitFor(() => expect(screen.getByText("Aucun roulement pour l'instant.")).toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: "+ Créer un roulement" }));
    expect(screen.getByText("Nouveau roulement")).toBeInTheDocument();
    expect(screen.getByText(/Création directe, sans passer par un budgétaire/)).toBeInTheDocument();
  });

  it("cache « Créer un budgétaire » pour Administration (canCreateBudgetFromRequest = Direction/Propriétaire seulement)", async () => {
    renderPage({ ...direction, persona: ROLES.ADMIN });
    await waitFor(() => expect(screen.getByText("Roulements")).toBeInTheDocument());
    expect(screen.queryByRole("button", { name: "🧮 Créer un budgétaire" })).not.toBeInTheDocument();
  });
});
