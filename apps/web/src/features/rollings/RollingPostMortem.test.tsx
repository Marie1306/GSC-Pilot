import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ROLES } from "@gsc-pilot/business-rules";
import type { Employee } from "@gsc-pilot/shared";
import { AuthContext, type AuthContextValue } from "../../lib/auth/AuthContext.js";
import { RollingPostMortem } from "./RollingPostMortem.js";
import type { RollingPostMortemDto } from "./api.js";

const direction: Employee = {
  id: "11111111-1111-1111-1111-111111111111",
  authUserId: "22222222-2222-2222-2222-222222222222",
  name: "Test Direction",
  initials: "TD",
  email: "test-direction@gscpilot.local",
  persona: ROLES.OWNER,
  skills: [],
  skillEfficiencies: {},
  costRate: 0,
  techLevelIds: [],
  active: true,
  createdAt: "2026-08-11T00:00:00.000Z",
  updatedAt: "2026-08-11T00:00:00.000Z",
};

const rollingId = "33333333-3333-3333-3333-333333333333";

const postMortem: RollingPostMortemDto = {
  id: rollingId,
  rollingNumber: "RL-2026-0001",
  contactName: "Client Test",
  company: "Client Test Inc.",
  plannedHours: 10,
  actualHours: 6,
  comparatif: [
    {
      category: "assemblyTest",
      categoryLabel: "Assemblage et test",
      plannedHours: 10,
      actualHours: 6,
      hoursDelta: -4,
      plannedCost: 1000,
      actualCost: 672,
      costDelta: -328,
    },
  ],
  sold: 2015,
  plannedPurchases: 500,
  actualPurchases: 150,
  grossMargin: 1193,
  grossMarginPct: 59.2,
  financialStatus: "conforme",
  costBreakdown: [
    { label: "Main-d'oeuvre", planned: 1000, actual: 672 },
    { label: "Achats et frais", planned: 500, actual: 150 },
  ],
  postMortemDepassements: "Aucun",
  postMortemAmeliorations: "RAS",
  postMortemRecommandation: "Continuer",
};

function renderPostMortem() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const authValue: AuthContextValue = {
    session: null,
    employee: direction,
    loading: false,
    error: null,
    signIn: async () => ({ error: null }),
    signOut: async () => {},
  };
  return render(
    <AuthContext.Provider value={authValue}>
      <QueryClientProvider client={queryClient}>
        <RollingPostMortem id={rollingId} onClose={() => {}} />
      </QueryClientProvider>
    </AuthContext.Provider>,
  );
}

function normalizeSpaces(value: string): string {
  return value.replace(/\s+/g, " ");
}

describe("RollingPostMortem — tuiles, comparatif, coûts, statut financier", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        if (url.includes(`/api/rollings/${rollingId}/post-mortem`)) return new Response(JSON.stringify({ postMortem }), { status: 200 });
        return new Response("{}", { status: 200 });
      }),
    );
  });

  function tileValue(label: string): string | null {
    const labels = screen.getAllByText(label);
    const tileLabel = labels.find((el) => el.className === "stat-tile-label");
    const raw = tileLabel?.nextElementSibling?.textContent ?? null;
    return raw !== null ? normalizeSpaces(raw) : null;
  }

  it("affiche l'en-tête avec le numéro de roulement", async () => {
    renderPostMortem();
    await screen.findByText("Post-mortem — RL-2026-0001");
    expect(screen.getByText("Client Test Inc. · comparaison planifié et réel")).toBeInTheDocument();
  });

  it("affiche les tuiles financières avec les bonnes valeurs", async () => {
    renderPostMortem();
    await screen.findByText("Comparatif planifié vs réel");
    expect(tileValue("Prix vendu")).toBe("2 015,00 $");
    expect(tileValue("Heures planifiées")).toBe("10 h");
    expect(tileValue("Heures réelles")).toBe("6 h");
    expect(tileValue("Achats planifiés")).toBe("500,00 $");
    expect(tileValue("Achats réels")).toBe("150,00 $");
    expect(tileValue("Marge brute")).toBe("1 193,00 $ · 59.2 %");
  });

  it("affiche le comparatif par catégorie sans détail par tâche", async () => {
    renderPostMortem();
    await screen.findByText("Assemblage et test");
    const row = screen.getByText("Assemblage et test").closest("tr")!;
    expect(within(row).getByText((_, el) => normalizeSpaces(el?.textContent ?? "") === "672,00 $")).toBeInTheDocument();
    expect(document.querySelector(".comparatif-task-row")).not.toBeInTheDocument();
  });

  it("affiche le tableau des coûts avec le Total calculé", async () => {
    renderPostMortem();
    await screen.findByText("Coûts planifiés et réels");
    expect(screen.getByText("Main-d'oeuvre")).toBeInTheDocument();
    expect(screen.getByText("Achats et frais")).toBeInTheDocument();
    expect(screen.getByText((_, el) => el?.tagName === "STRONG" && normalizeSpaces(el.textContent ?? "") === "1 500,00 $")).toBeInTheDocument();
    expect(screen.getByText((_, el) => el?.tagName === "STRONG" && normalizeSpaces(el.textContent ?? "") === "822,00 $")).toBeInTheDocument();
  });

  it("affiche le bandeau de statut financier conforme", async () => {
    renderPostMortem();
    await screen.findByText("Conforme");
  });

  it("n'affiche aucune carte back-up (jamais applicable à un roulement)", async () => {
    renderPostMortem();
    await screen.findByText("Coûts planifiés et réels");
    expect(screen.queryByText("Réserves budgétaires")).not.toBeInTheDocument();
    expect(screen.queryByText(/Back-up/)).not.toBeInTheDocument();
  });

  it("affiche l'analyse finale enregistrée et permet de la modifier (Direction)", async () => {
    renderPostMortem();
    await screen.findByText("Analyse finale");
    expect(screen.getByDisplayValue("Aucun")).toBeInTheDocument();
    expect(screen.getByDisplayValue("RAS")).toBeInTheDocument();
    expect(screen.getByDisplayValue("Continuer")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Enregistrer l'analyse" })).toBeInTheDocument();
  });
});
