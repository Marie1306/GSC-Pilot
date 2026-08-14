import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
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
        // Vérifier le chemin le plus spécifique en premier — /api/purchase-requests/categories
        // est un préfixe de /api/purchase-requests, un .includes() dans le mauvais ordre
        // renverrait la mauvaise forme de réponse à l'un des deux appels.
        if (url.includes("/api/purchase-requests/categories")) {
          return new Response(JSON.stringify({ categories: [{ id: "c1", name: "Outillage", thresholdAmount: 1000 }] }), { status: 200 });
        }
        if (url.includes("/api/purchase-requests")) {
          return new Response(JSON.stringify({ purchaseRequests: [] }), { status: 200 });
        }
        if (url.includes("/api/projects")) {
          return new Response(JSON.stringify({ projects: [{ id: "p1", projectNumber: "PRJ-0001", name: "Projet test" }] }), { status: 200 });
        }
        return new Response("{}", { status: 200 });
      }),
    );
  });

  it("affiche le formulaire de demande d'achat par défaut, la liste rapide dans son propre onglet", async () => {
    renderPage(direction);
    // "Demande d'achat" apparaît deux fois (le bouton d'onglet ET le titre du formulaire) — getByRole distingue les deux.
    expect(await screen.findByRole("heading", { name: "Demande d'achat" })).toBeInTheDocument();
    expect(screen.queryByText("Liste rapide d'achats de projet")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("tab", { name: "Liste rapide de projet" }));
    expect(await screen.findByText("Liste rapide d'achats de projet")).toBeInTheDocument();
    await waitFor(() => expect(screen.getByText("Aucune demande en attente pour l'instant.")).toBeInTheDocument());
  });

  it("Employé voit les deux onglets — checklist ouverte à tous depuis le 13 août 2026 (canSubmitPurchaseRequest)", async () => {
    renderPage({ ...direction, persona: ROLES.MEMBER });
    expect(await screen.findByRole("tab", { name: "Demande d'achat" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Liste rapide de projet" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("tab", { name: "Liste rapide de projet" }));
    expect(await screen.findByText("Liste rapide d'achats de projet")).toBeInTheDocument();
  });
});
