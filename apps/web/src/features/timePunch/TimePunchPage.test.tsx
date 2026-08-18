import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ROLES } from "@gsc-pilot/business-rules";
import type { Employee } from "@gsc-pilot/shared";
import { AuthContext, type AuthContextValue } from "../../lib/auth/AuthContext.js";
import { TimePunchPage } from "./TimePunchPage.js";

const member: Employee = {
  id: "11111111-1111-1111-1111-111111111111",
  authUserId: "22222222-2222-2222-2222-222222222222",
  name: "Test Employé",
  initials: "TE",
  email: "test-employe@gscpilot.local",
  persona: ROLES.MEMBER,
  skills: [],
  skillEfficiencies: {},
  costRate: 28,
  techLevelIds: [],
  active: true,
  createdAt: "2026-08-18T00:00:00.000Z",
  updatedAt: "2026-08-18T00:00:00.000Z",
};

const direction: Employee = { ...member, id: "33333333-3333-3333-3333-333333333333", persona: ROLES.OWNER, name: "Test Direction" };

const submittedEntry = {
  id: "44444444-4444-4444-4444-444444444444",
  date: "2026-08-18",
  employeeId: member.id,
  employeeName: member.name,
  projectType: "internal",
  projectId: null,
  projectLabel: null,
  serviceCallId: null,
  category: "internal",
  categoryLabel: "Interne — Amélioration GSC",
  taskId: "55555555-5555-5555-5555-555555555555",
  taskLabel: "Formation",
  startAt: "2026-08-18T13:00:00.000Z",
  endAt: "2026-08-18T15:00:00.000Z",
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
    <MemoryRouter>
      <QueryClientProvider client={queryClient}>
        <AuthContext.Provider value={authValue}>
          <TimePunchPage />
        </AuthContext.Provider>
      </QueryClientProvider>
    </MemoryRouter>,
  );
}

function stubFetch() {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      if (url.includes("/api/punchable-tasks")) return new Response(JSON.stringify({ tasks: [] }), { status: 200 });
      if (url.includes("/api/time-entries/project-options")) return new Response(JSON.stringify({ projects: [] }), { status: 200 });
      if (url.includes("/api/time-entries/service-call-options")) return new Response(JSON.stringify({ serviceCalls: [] }), { status: 200 });
      if (url.includes("/api/time-entries/employees")) return new Response(JSON.stringify({ employees: [] }), { status: 200 });
      if (url.includes("/api/settings/tech-levels")) return new Response(JSON.stringify({ techLevels: [] }), { status: 200 });
      if (url.includes("/api/time-entries/mine")) return new Response(JSON.stringify({ timeEntries: [submittedEntry] }), { status: 200 });
      if (url.includes("/api/time-entries/all")) return new Response(JSON.stringify({ timeEntries: [submittedEntry] }), { status: 200 });
      return new Response("{}", { status: 200 });
    }),
  );
}

describe("TimePunchPage", () => {
  beforeEach(stubFetch);

  it("affiche 'Prêt à puncher' et 'Mes entrées' pour un Employé", async () => {
    renderPage(member);
    expect(screen.getByText("Prêt à puncher")).toBeInTheDocument();
    expect(screen.getByText("Mes entrées")).toBeInTheDocument();
    await waitFor(() => expect(screen.getByText("Formation")).toBeInTheDocument());
    expect(screen.getByText("2h00")).toBeInTheDocument();
  });

  it("affiche 'Toutes les entrées' et un bouton Approuver pour la Direction", async () => {
    renderPage(direction);
    expect(screen.getByText("Toutes les entrées")).toBeInTheDocument();
    await waitFor(() => expect(screen.getByText("Test Employé")).toBeInTheDocument());
    expect(screen.getByRole("button", { name: "Approuver" })).toBeInTheDocument();
  });

  it("ouvre la modale 'Débuter une tâche' au clic", async () => {
    renderPage(member);
    fireEvent.click(screen.getByRole("button", { name: "Débuter une tâche" }));
    expect(await screen.findByText("Le chronomètre démarre à l'enregistrement.")).toBeInTheDocument();
  });
});
