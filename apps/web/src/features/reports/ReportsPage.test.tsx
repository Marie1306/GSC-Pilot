import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ROLES } from "@gsc-pilot/business-rules";
import type { Employee } from "@gsc-pilot/shared";
import { AuthContext, type AuthContextValue } from "../../lib/auth/AuthContext.js";
import { ReportsPage } from "./ReportsPage.js";
import type { ReportsOverviewDto } from "./api.js";
import type { PostMortemDto } from "../projects/api.js";
import type { RollingPostMortemDto } from "../rollings/api.js";

const admin: Employee = {
  id: "11111111-1111-1111-1111-111111111111",
  authUserId: "22222222-2222-2222-2222-222222222222",
  name: "Test Administration",
  initials: "TA",
  email: "test-admin@gscpilot.local",
  persona: ROLES.ADMIN,
  skills: [],
  skillEfficiencies: {},
  costRate: 0,
  techLevelIds: [],
  active: true,
  createdAt: "2026-08-11T00:00:00.000Z",
  updatedAt: "2026-08-11T00:00:00.000Z",
};

const projectId = "33333333-3333-3333-3333-333333333333";
const rollingId = "44444444-4444-4444-4444-444444444444";
const callId = "55555555-5555-5555-5555-555555555555";

const overview: ReportsOverviewDto = {
  profitability: [
    {
      id: projectId,
      type: "project",
      typeLabel: "Projet",
      displayId: "42",
      label: "Projet Vérif",
      clientLabel: "Client Vérif",
      revenue: 1000,
      cost: 500,
      grossMargin: 500,
      grossMarginPct: 50,
      financialStatus: "conforme",
      actualHours: 10,
    },
    {
      id: rollingId,
      type: "rolling",
      typeLabel: "Roulement",
      displayId: "RL-2026-0001",
      label: "Client Roulement",
      clientLabel: "Client Roulement",
      revenue: 2000,
      cost: 800,
      grossMargin: 1200,
      grossMarginPct: 60,
      financialStatus: "conforme",
      actualHours: 6,
    },
    {
      id: callId,
      type: "service_call",
      typeLabel: "Call de service",
      displayId: "CS-2026-0001",
      label: "Call Vérif",
      clientLabel: "Client Call",
      revenue: 300,
      cost: 100,
      grossMargin: 200,
      grossMarginPct: 66.7,
      financialStatus: "conforme",
      actualHours: 2,
    },
  ],
  channelConversion: [],
  internalStats: {
    year: 2026,
    availableYears: [2026],
    hours: { tasks: [], hours: 0, value: 0, detail: [] },
    purchases: { categories: [], amount: 0, count: 0, detail: [] },
  },
};

const projectPostMortem: PostMortemDto = {
  id: projectId,
  projectNumber: "42",
  name: "Projet Vérif",
  plannedHours: 10,
  actualHours: 10,
  backupHours: 0,
  comparatif: [],
  postMortemDepassements: null,
  postMortemAmeliorations: null,
  postMortemRecommandation: null,
};

const rollingPostMortem: RollingPostMortemDto = {
  id: rollingId,
  rollingNumber: "RL-2026-0001",
  contactName: "Client Roulement",
  company: null,
  plannedHours: 6,
  actualHours: 6,
  comparatif: [],
  postMortemDepassements: null,
  postMortemAmeliorations: null,
  postMortemRecommandation: null,
};

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const authValue: AuthContextValue = {
    session: null,
    employee: admin,
    loading: false,
    error: null,
    signIn: async () => ({ error: null }),
    signOut: async () => {},
  };
  return render(
    <MemoryRouter>
      <AuthContext.Provider value={authValue}>
        <QueryClientProvider client={queryClient}>
          <ReportsPage />
        </QueryClientProvider>
      </AuthContext.Provider>
    </MemoryRouter>,
  );
}

describe("ReportsPage — comparatif de rentabilité, lignes cliquables", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn(async (url: string) => {
      if (url.includes("/api/reports/overview")) return new Response(JSON.stringify(overview), { status: 200 });
      if (url.includes(`/api/projects/${projectId}/post-mortem`)) return new Response(JSON.stringify({ postMortem: projectPostMortem }), { status: 200 });
      if (url.includes(`/api/rollings/${rollingId}/post-mortem`)) return new Response(JSON.stringify({ rolling: rollingPostMortem, postMortem: rollingPostMortem }), { status: 200 });
      if (url.includes(`/api/service-calls/${callId}`)) return new Response("{}", { status: 200 });
      if (url.includes("/api/time-entries/employees")) return new Response(JSON.stringify({ employees: [] }), { status: 200 });
      return new Response("{}", { status: 200 });
    });
    vi.stubGlobal("fetch", fetchMock);
  });

  // clientLabel est la seule colonne dont le texte n'est jamais concaténé
  // avec autre chose (la colonne Dossier combine displayId + label dans la
  // même cellule, ex. "42 — Projet Vérif" en 2 noeuds texte adjacents) —
  // ciblage des lignes toujours via cette colonne pour un texte exact fiable.
  it("affiche les 3 lignes du comparatif, une par type de dossier", async () => {
    renderPage();
    await screen.findByText("Client Vérif");
    expect(screen.getByText("Client Roulement")).toBeInTheDocument();
    expect(screen.getByText("Client Call")).toBeInTheDocument();
  });

  it("clic sur une ligne Projet ouvre son Post-mortem", async () => {
    renderPage();
    const row = (await screen.findByText("Client Vérif")).closest("tr")!;
    row.click();
    await screen.findByText("Post-mortem — 42");
  });

  it("clic sur une ligne Roulement ouvre son Post-mortem", async () => {
    renderPage();
    const row = (await screen.findByText("Client Roulement")).closest("tr")!;
    row.click();
    await screen.findByText("Post-mortem — RL-2026-0001");
  });

  it("clic sur une ligne Call de service ouvre sa fiche (pas de Post-mortem pour un call)", async () => {
    renderPage();
    const row = (await screen.findByText("Client Call")).closest("tr")!;
    row.click();
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining(`/api/service-calls/${callId}`), expect.anything()));
    expect(screen.queryByText(/Post-mortem/)).not.toBeInTheDocument();
  });
});
