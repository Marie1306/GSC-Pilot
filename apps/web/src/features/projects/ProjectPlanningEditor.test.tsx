import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ROLES } from "@gsc-pilot/business-rules";
import type { Employee } from "@gsc-pilot/shared";
import { AuthContext, type AuthContextValue } from "../../lib/auth/AuthContext.js";
import { ProjectPlanningEditor } from "./ProjectPlanningEditor.js";
import type { ProjectDetail } from "./api.js";

const baseEmployee: Employee = {
  id: "00000000-0000-0000-0000-000000000000",
  authUserId: "00000000-0000-0000-0000-000000000001",
  name: "Test",
  initials: "T",
  email: "test@gscpilot.local",
  persona: ROLES.OWNER,
  skills: [],
  skillEfficiencies: {},
  costRate: 0,
  techLevelIds: [],
  active: true,
  createdAt: "2026-08-11T00:00:00.000Z",
  updatedAt: "2026-08-11T00:00:00.000Z",
};

const baseProject: ProjectDetail = {
  id: "10000000-0000-0000-0000-000000000000",
  projectNumber: "42",
  name: "Projet vérif",
  status: "active",
  contactId: "20000000-0000-0000-0000-000000000000",
  contactName: "Client Vérif",
  company: null,
  contactRole: null,
  contactPhone: null,
  contactEmail: null,
  budgetId: null,
  budgetDisplayId: null,
  clientRequestId: null,
  createdAt: "2026-08-19T00:00:00.000Z",
  sold: 0,
  plannedHours: 0,
  actualHours: 0,
  hoursUsedPct: 0,
  plannedPurchases: 0,
  actualPurchases: 0,
  installationPlannedHours: 0,
  installationPlannedCost: 0,
  backupHours: 0,
  backupHoursCost: 0,
  projectBackupAmount: 0,
  comparatif: [],
  productionCompleted: false,
  fulfillmentMode: null,
  fulfillmentStatus: null,
  fulfillmentAddress: null,
  fulfillmentConfirmationNote: null,
  billingReady: false,
  warrantyExpected: false,
  warrantyEndsAt: null,
  lifecycleTab: "active",
  deadline: null,
  archivedAt: null,
  deletedAt: null,
};

function renderEditor(project: ProjectDetail, persona: Employee["persona"]) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const authValue: AuthContextValue = {
    session: null,
    employee: { ...baseEmployee, persona },
    loading: false,
    error: null,
    signIn: async () => ({ error: null }),
    signOut: async () => {},
  };
  return render(
    <AuthContext.Provider value={authValue}>
      <QueryClientProvider client={queryClient}>
        <ProjectPlanningEditor project={project} />
      </QueryClientProvider>
    </AuthContext.Provider>,
  );
}

describe("ProjectPlanningEditor", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("{}", { status: 200 })));
  });

  it("bouton visible pour la Direction sur un projet sans budgétaire", () => {
    renderEditor(baseProject, ROLES.OWNER);
    expect(screen.getByRole("button", { name: "Remplir les données planifiées" })).toBeInTheDocument();
  });

  it("bouton absent pour l'Administration — note informative seulement", () => {
    renderEditor(baseProject, ROLES.ADMIN);
    expect(screen.queryByRole("button", { name: "Remplir les données planifiées" })).not.toBeInTheDocument();
    expect(screen.getByText("Direction ou Propriétaire peuvent remplir ces champs.")).toBeInTheDocument();
  });

  it("rien n'est affiché sur un projet converti depuis un budgétaire (gelé)", () => {
    renderEditor({ ...baseProject, budgetId: "20000000-0000-0000-0000-000000000000" }, ROLES.OWNER);
    expect(screen.queryByText("Projet sans budgétaire")).not.toBeInTheDocument();
  });
});
