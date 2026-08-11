import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ROLES } from "@gsc-pilot/business-rules";
import type { Employee } from "@gsc-pilot/shared";
import { AuthContext, type AuthContextValue } from "../../lib/auth/AuthContext.js";
import { PurchasesPage } from "./PurchasesPage.js";

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
        <PurchasesPage />
      </AuthContext.Provider>
    </QueryClientProvider>,
  );
}

describe("PurchasesPage", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        if (url.includes("/api/projects")) {
          return new Response(JSON.stringify({ projects: [{ id: "p1", projectNumber: "PRJ-0001", name: "Projet test" }] }), { status: 200 });
        }
        if (url.includes("/api/purchase-requests")) {
          return new Response(JSON.stringify({ purchaseRequests: [] }), { status: 200 });
        }
        return new Response("{}", { status: 200 });
      }),
    );
  });

  it("affiche le formulaire de liste rapide pour Direction (owner)", async () => {
    renderPage(direction);
    expect(await screen.findByText("Liste rapide d'achats de projet")).toBeInTheDocument();
    await waitFor(() => expect(screen.getByText("Aucune demande en attente pour l'instant.")).toBeInTheDocument());
  });

  it("cache le formulaire de liste rapide pour un Employé", async () => {
    renderPage({ ...direction, persona: ROLES.MEMBER });
    await waitFor(() => expect(screen.getByText("Demandes d'achat en attente")).toBeInTheDocument());
    expect(screen.queryByText("Liste rapide d'achats de projet")).not.toBeInTheDocument();
  });
});
