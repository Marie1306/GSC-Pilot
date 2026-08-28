import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ROLES } from "@gsc-pilot/business-rules";
import type { Employee } from "@gsc-pilot/shared";
import { AuthContext, type AuthContextValue } from "../../lib/auth/AuthContext.js";
import { ManualEntryModal } from "./ManualEntryModal.js";
import type { TimeEntryDto } from "./api.js";

const owner: Employee = {
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

const existingEntry: TimeEntryDto = {
  id: "99999999-9999-9999-9999-999999999999",
  date: "2026-08-19",
  employeeId: owner.id,
  employeeName: owner.name,
  projectType: "internal",
  projectId: null,
  projectLabel: null,
  rollingId: null,
  rollingLabel: null,
  serviceCallId: null,
  category: "internal",
  categoryLabel: "Interne — Amélioration GSC",
  taskId: "55555555-5555-5555-5555-555555555555",
  taskLabel: "Formation",
  startAt: "2026-08-19T13:00:00.000Z",
  endAt: "2026-08-19T15:00:00.000Z",
  exactMinutes: 118,
  roundedMinutes: 120,
  note: null,
  status: "submitted",
  locked: false,
  techLevelId: null,
  techLevelLabel: null,
  rateType: null,
  blockageNote: null,
};

function renderModal(entry?: TimeEntryDto) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const authValue: AuthContextValue = {
    session: null,
    employee: owner,
    loading: false,
    error: null,
    signIn: async () => ({ error: null }),
    signOut: async () => {},
  };
  return render(
    <AuthContext.Provider value={authValue}>
      <QueryClientProvider client={queryClient}>
        <ManualEntryModal onClose={() => {}} entry={entry} />
      </QueryClientProvider>
    </AuthContext.Provider>,
  );
}

describe("ManualEntryModal — saisie en lot", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        if (url.includes("/api/punchable-tasks")) return new Response(JSON.stringify({ tasks: [] }), { status: 200 });
        if (url.includes("/api/time-entries/project-options")) return new Response(JSON.stringify({ projects: [] }), { status: 200 });
        if (url.includes("/api/time-entries/service-call-options")) return new Response(JSON.stringify({ serviceCalls: [] }), { status: 200 });
        if (url.includes("/api/time-entries/employees")) return new Response(JSON.stringify({ employees: [] }), { status: 200 });
        if (url.includes("/api/settings/tech-levels")) return new Response(JSON.stringify({ techLevels: [] }), { status: 200 });
        return new Response("{}", { status: 200 });
      }),
    );
  });

  it("création : commence avec une entrée, sans bouton de retrait", () => {
    renderModal();
    expect(screen.getAllByLabelText("Heures exactes")).toHaveLength(1);
    expect(screen.queryByLabelText("Retirer cette entrée")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "+ Ajouter une entrée" })).toBeInTheDocument();
  });

  it("« + Ajouter une entrée » ajoute une deuxième ligne avec un bouton de retrait sur chacune", () => {
    renderModal();
    fireEvent.click(screen.getByRole("button", { name: "+ Ajouter une entrée" }));
    expect(screen.getAllByLabelText("Heures exactes")).toHaveLength(2);
    expect(screen.getAllByLabelText("Retirer cette entrée")).toHaveLength(2);
  });

  it("retirer une ligne revient à une seule entrée sans bouton de retrait", () => {
    renderModal();
    fireEvent.click(screen.getByRole("button", { name: "+ Ajouter une entrée" }));
    fireEvent.click(screen.getAllByLabelText("Retirer cette entrée")[0]!);
    expect(screen.getAllByLabelText("Heures exactes")).toHaveLength(1);
    expect(screen.queryByLabelText("Retirer cette entrée")).not.toBeInTheDocument();
  });

  it("édition d'un punch existant : une seule ligne, aucun bouton d'ajout ni de retrait", () => {
    renderModal(existingEntry);
    expect(screen.getAllByLabelText("Heures exactes")).toHaveLength(1);
    expect(screen.queryByRole("button", { name: "+ Ajouter une entrée" })).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Retirer cette entrée")).not.toBeInTheDocument();
    expect(screen.getByText("Correction avant approbation — la personne et la date ne changent jamais ici.")).toBeInTheDocument();
  });
});
