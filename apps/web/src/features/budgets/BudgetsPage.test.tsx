import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ROLES } from "@gsc-pilot/business-rules";
import type { Employee } from "@gsc-pilot/shared";
import { AuthContext, type AuthContextValue } from "../../lib/auth/AuthContext.js";
import { BudgetsPage } from "./BudgetsPage.js";

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
  techLevelId: null,
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
    <QueryClientProvider client={queryClient}>
      <AuthContext.Provider value={authValue}>
        <BudgetsPage />
      </AuthContext.Provider>
    </QueryClientProvider>,
  );
}

describe("BudgetsPage", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        if (url.includes("/api/budgets")) {
          return new Response(JSON.stringify({ budgets: [] }), { status: 200 });
        }
        return new Response("{}", { status: 200 });
      }),
    );
  });

  it("affiche le bouton de création pour Direction (owner)", async () => {
    renderPage(direction);
    expect(await screen.findByText("+ Nouveau budgétaire")).toBeInTheDocument();
    await waitFor(() => expect(screen.getByText("Aucun budgétaire pour l'instant.")).toBeInTheDocument());
  });

  it("affiche le bouton de création pour le Propriétaire (boss)", async () => {
    renderPage({ ...direction, persona: ROLES.BOSS });
    expect(await screen.findByText("+ Nouveau budgétaire")).toBeInTheDocument();
  });

  it("cache le bouton de création pour Administration — création réservée à Direction/Propriétaire, jamais Administration", async () => {
    renderPage({ ...direction, persona: ROLES.ADMIN });
    await waitFor(() => expect(screen.getByText("Budgétaires")).toBeInTheDocument());
    expect(screen.queryByText("+ Nouveau budgétaire")).not.toBeInTheDocument();
  });
});
