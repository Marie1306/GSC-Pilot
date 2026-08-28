import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ROLES } from "@gsc-pilot/business-rules";
import type { Employee } from "@gsc-pilot/shared";
import { AuthContext, type AuthContextValue } from "../../lib/auth/AuthContext.js";
import { RollingDetail } from "./RollingDetail.js";
import type { RollingDetailDto } from "./api.js";
import type { ProjectPurchaseEntryDto } from "../purchases/api.js";

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

const rolling: RollingDetailDto = {
  id: rollingId,
  contactId: "66666666-6666-6666-6666-666666666666",
  contactName: "Client Test",
  company: "Client Test Inc.",
  contactPhone: null,
  contactEmail: null,
  status: "active",
  budgetId: "44444444-4444-4444-4444-444444444444",
  budgetDisplayId: "BG-2026-0001",
  clientRequestId: null,
  createdAt: "2026-08-28T00:00:00.000Z",
  sold: 2015,
  plannedHours: 10,
  actualHours: 6,
  hoursUsedPct: 60,
  plannedPurchases: 500,
  actualPurchases: 150,
  grossMargin: 1193,
  grossMarginPct: 59.2,
  targetMarginPct: 25.87,
  financialStatus: "conforme",
  progressionPct: 50,
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
  productionCompleted: false,
  fulfillmentMode: null,
  fulfillmentStatus: null,
  fulfillmentAddress: null,
  fulfillmentDriverId: null,
  fulfillmentDriverName: null,
  fulfillmentScheduled: null,
  fulfillmentConfirmationNote: null,
  billingReady: false,
  archivedAt: null,
  deletedAt: null,
};

const purchaseEntry: ProjectPurchaseEntryDto = {
  id: "55555555-5555-5555-5555-555555555555",
  projectId: null,
  rollingId,
  date: "2026-08-28T00:00:00.000Z",
  category: "Matériel",
  supplier: "Fournisseur Test",
  description: "Test achat réel roulement",
  amount: 150,
  enteredById: direction.id,
  enteredByName: direction.name,
  status: "approved",
  approvedById: direction.id,
  approvedByName: direction.name,
  approvedAt: "2026-08-28T00:00:00.000Z",
  note: null,
  createdAt: "2026-08-28T00:00:00.000Z",
};

function renderDetail() {
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
    <MemoryRouter>
      <AuthContext.Provider value={authValue}>
        <QueryClientProvider client={queryClient}>
          <RollingDetail id={rollingId} onClose={() => {}} />
        </QueryClientProvider>
      </AuthContext.Provider>
    </MemoryRouter>,
  );
}

/** Normalise tout espace (dont l'insécable des séparateurs de milliers Intl.NumberFormat fr-CA) en espace ASCII simple, pour des comparaisons de texte lisibles. */
function normalizeSpaces(value: string): string {
  return value.replace(/\s+/g, " ");
}

describe("RollingDetail — tuiles financières, Progression, Comparatif, Achats réels", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        if (url.includes(`/api/rollings/${rollingId}/invoice-plan`)) return new Response(JSON.stringify({ plan: [] }), { status: 200 });
        if (url.includes(`/api/rollings/${rollingId}/purchase-entries`)) return new Response(JSON.stringify({ entries: [purchaseEntry] }), { status: 200 });
        if (url.includes(`/api/rollings/${rollingId}`)) return new Response(JSON.stringify({ rolling }), { status: 200 });
        if (url.includes("/api/purchase-requests/categories")) return new Response(JSON.stringify({ categories: [] }), { status: 200 });
        if (url.includes("/api/time-entries/employees")) return new Response(JSON.stringify({ employees: [] }), { status: 200 });
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

  it("affiche les 9 tuiles financières avec les bonnes valeurs", async () => {
    renderDetail();
    await screen.findByText("Assemblage et test");

    expect(tileValue("Prix vendu")).toBe("2 015,00 $");
    expect(tileValue("Heures planifiées")).toBe("10 h");
    expect(tileValue("Heures réelles")).toBe("6 h");
    expect(tileValue("Utilisation heures")).toBe("60 %");
    expect(tileValue("Achats prévus")).toBe("500,00 $");
    expect(tileValue("Achats réels")).toBe("150,00 $");
    expect(tileValue("Marge brute réelle")).toBe("1 193,00 $");
    expect(tileValue("Marge brute %")).toBe("59.2 %");
    expect(tileValue("Marge visée")).toBe("25.87 %");
  });

  it("affiche la carte Progression avec le bon pourcentage", async () => {
    renderDetail();
    await screen.findByText("Progression du roulement");
    const progressionValues = screen.getAllByText("50 %");
    expect(progressionValues.length).toBeGreaterThan(0);
    expect(screen.getByText((_, el) => normalizeSpaces(el?.textContent ?? "") === "6 / 10 h")).toBeInTheDocument();
    expect(screen.getByText((_, el) => normalizeSpaces(el?.textContent ?? "") === "150,00 $ / 500,00 $")).toBeInTheDocument();
  });

  it("affiche le tableau Comparatif planifié vs réel par catégorie", async () => {
    renderDetail();
    await screen.findByText("Comparatif planifié vs réel");
    expect(screen.getByText("Assemblage et test")).toBeInTheDocument();
    expect(screen.getByText((_, el) => normalizeSpaces(el?.textContent ?? "") === "672,00 $")).toBeInTheDocument();
  });

  it("affiche la section Achats réels avec l'entrée existante et les 2 boutons", async () => {
    renderDetail();
    await waitFor(() => expect(screen.getByText("Fournisseur Test")).toBeInTheDocument());
    expect(screen.getByRole("button", { name: "🛒 Ajouter un achat" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "🛒 Voir tous les achats approuvés" })).toBeInTheDocument();
    expect(screen.getByText("Test achat réel roulement")).toBeInTheDocument();
  });
});
