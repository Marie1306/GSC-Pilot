import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ROLES } from "@gsc-pilot/business-rules";
import type { Employee } from "@gsc-pilot/shared";
import { AuthContext, type AuthContextValue } from "../../lib/auth/AuthContext.js";
import { BudgetDetail } from "./BudgetDetail.js";
import type { BudgetDetail as BudgetDetailDto } from "./api.js";

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

const budgetId = "33333333-3333-3333-3333-333333333333";
const pliageRowId = "44444444-4444-4444-4444-444444444444";

/**
 * Reproduit le rapport de Marie (29 août 2026) : un budgétaire déjà créé à
 * partir d'une demande client, où entrer des heures sur une ligne ne
 * semblait déclencher aucun recalcul (Heures/Coût planifié/Prix de vente
 * restaient à 0 dans sa capture d'écran). Le back-end a été vérifié
 * correct contre Postgres réel (script jetable, supprimé) — ce test vérifie
 * la chaîne frontend complète (saisie → PATCH → invalidation → réaffichage)
 * avec le VRAI composant, un serveur mock qui recalcule comme le ferait
 * réellement l'API (sectionSummary de business-rules).
 */
function makeBudget(pliageHours: number): BudgetDetailDto {
  const hourlyRate = 113;
  const hours = pliageHours;
  const baseCost = hours * hourlyRate;
  const sale = Math.round(baseCost * 1.25 * 100) / 100;
  return {
    id: budgetId,
    displayId: "BG-2026-0014",
    status: "draft",
    contactName: "Contact Test",
    company: "AGT",
    createdByName: "Test Direction",
    createdAt: "2026-08-28T00:00:00.000Z",
    totalSale: sale,
    backupHourlyRate: 0,
    backupHoursPct: 0,
    backupHoursComplexity: 0,
    projectBackupAmount: 0,
    projectBackupComplexity: 0,
    poNumber: null,
    quantity: 1,
    validUntil: null,
    summary: "Résumé test",
    riskSummary: "Aucun risque",
    clientRequestId: "55555555-5555-5555-5555-555555555555",
    clientRequestDisplayId: "DC-2026-0019",
    requestType: "project",
    email: null,
    phone: null,
    requestCreatedAt: null,
    requestSummary: null,
    sentAt: null,
    contractWonAt: null,
    readOnly: false,
    sections: [
      {
        id: "66666666-6666-6666-6666-666666666666",
        category: "fabrication",
        kind: "labor",
        hours,
        baseCost,
        sale,
        complexity: 0,
        margin: 25,
        rows: [
          {
            id: pliageRowId,
            label: "Pliage",
            hourlyRate,
            hours,
            qty: 0,
            unitPrice: 0,
            directionOnly: true,
            auto: false,
            risk: null,
          },
        ],
      },
    ],
    backup: { hours: 0, baseCost: 0, sale: 0, pct: 0, complexity: 0, margin: 0, rate: 0 },
    projectBackup: { baseCost: 0, sale: 0, complexity: 0, margin: 0 },
    totals: { totalHours: hours, totalBaseCost: baseCost, totalSale: sale },
    notes: [],
  };
}

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
          <BudgetDetail id={budgetId} onClose={() => {}} />
        </QueryClientProvider>
      </AuthContext.Provider>
    </MemoryRouter>,
  );
}

function normalizeSpaces(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

describe("BudgetDetail — saisie des heures d'une ligne recalcule bien la section", () => {
  let currentHours: number;

  beforeEach(() => {
    currentHours = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init?: RequestInit) => {
        if (init?.method === "PATCH" && url.includes(`/api/budgets/${budgetId}/rows/${pliageRowId}`)) {
          const patch = JSON.parse(init.body as string) as { hours?: number };
          if (patch.hours !== undefined) currentHours = patch.hours;
          return new Response(null, { status: 204 });
        }
        if (url.includes(`/api/budgets/${budgetId}`)) {
          return new Response(JSON.stringify({ budget: makeBudget(currentHours) }), { status: 200 });
        }
        return new Response("{}", { status: 200 });
      }),
    );
  });

  it("après avoir saisi 3h sur Pliage et perdu le focus, la section affiche 3h / 339,00 $", async () => {
    const { container } = renderDetail();
    await screen.findByText("Pliage");

    const sectionTotal = () => normalizeSpaces(container.querySelector(".budget-section-total")?.textContent ?? "");
    expect(sectionTotal()).toBe("Heures 0Coût planifié 0,00 $Marge 25 %Prix de vente 0,00 $");

    const hoursInput = container.querySelector<HTMLInputElement>(".budget-rows-table input[type='number']")!;
    fireEvent.change(hoursInput, { target: { value: "3" } });
    fireEvent.blur(hoursInput);

    await waitFor(() => {
      expect(sectionTotal()).toBe("Heures 3Coût planifié 339,00 $Marge 25 %Prix de vente 423,75 $");
    });
  });
});
