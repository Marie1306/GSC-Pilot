import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ROLES } from "@gsc-pilot/business-rules";
import type { Employee } from "@gsc-pilot/shared";
import { AuthContext, type AuthContextValue } from "../../lib/auth/AuthContext.js";
import { ErrorReportsPage } from "./ErrorReportsPage.js";

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
  createdAt: "2026-08-11T00:00:00.000Z",
  updatedAt: "2026-08-11T00:00:00.000Z",
};

const memberId = "33333333-3333-3333-3333-333333333333";
const warehouseId = "44444444-4444-4444-4444-444444444444";

const summaries = [
  { employeeId: memberId, employeeName: "Test Employé", reportCount: 1, totalMaterialValue: 50, totalHoursLost: 1, totalHoursValue: 28 },
];
const subjects = [
  { id: memberId, name: "Test Employé", costRate: 28 },
  { id: warehouseId, name: "Test Magasinier", costRate: 26 },
];
const memberReports = [
  {
    id: "55555555-5555-5555-5555-555555555555",
    employeeId: memberId,
    employeeName: "Test Employé",
    materialValue: 50,
    hoursLost: 1,
    hourlyRateSnapshot: 28,
    hoursValue: 28,
    note: "Pièce mal coupée",
    createdById: direction.id,
    createdByName: direction.name,
    createdAt: "2026-08-28T00:00:00.000Z",
    photos: [],
  },
];

function renderPage() {
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
          <ErrorReportsPage />
        </QueryClientProvider>
      </AuthContext.Provider>
    </MemoryRouter>,
  );
}

function normalizeSpaces(value: string): string {
  return value.replace(/\s+/g, " ");
}

describe("ErrorReportsPage — module Rapport d'erreurs", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        if (url.includes(`/api/error-reports/by-employee/${memberId}`)) return new Response(JSON.stringify({ reports: memberReports }), { status: 200 });
        if (url.includes("/api/error-reports/by-employee")) return new Response(JSON.stringify({ summaries, availableYears: [2026] }), { status: 200 });
        if (url.includes("/api/error-reports/subjects")) return new Response(JSON.stringify({ employees: subjects }), { status: 200 });
        return new Response("{}", { status: 200 });
      }),
    );
  });

  it("affiche le tableau groupé par employé avec les bons totaux", async () => {
    renderPage();
    await screen.findByText("Test Employé");
    expect(screen.getByText((_, el) => normalizeSpaces(el?.textContent ?? "") === "50,00 $")).toBeInTheDocument();
    expect(screen.getByText((_, el) => normalizeSpaces(el?.textContent ?? "") === "1 h")).toBeInTheDocument();
    expect(screen.getByText((_, el) => normalizeSpaces(el?.textContent ?? "") === "28,00 $")).toBeInTheDocument();
  });

  it("le formulaire de création ne propose que les employés Employé/Magasinier", async () => {
    renderPage();
    fireEvent.click(await screen.findByText("+ Nouveau rapport d'erreur"));
    await screen.findByText("Nouveau rapport d'erreur");
    const select = (await screen.findByLabelText("Employé visé")) as HTMLSelectElement;
    const optionLabels = Array.from(select.options).map((option) => option.textContent);
    expect(optionLabels).toContain("Test Employé");
    expect(optionLabels).toContain("Test Magasinier");
    expect(optionLabels).not.toContain("Test Direction");
  });

  it("ouvre le drill-down d'un employé et affiche son rapport", async () => {
    renderPage();
    await screen.findByText("Test Employé");
    fireEvent.click(screen.getByRole("button", { name: "Ouvrir" }));
    await waitFor(() => expect(screen.getByText("Pièce mal coupée")).toBeInTheDocument());
    expect(screen.getByText((_, el) => normalizeSpaces(el?.textContent ?? "") === "Rapporté par Test Direction")).toBeInTheDocument();
  });
});
