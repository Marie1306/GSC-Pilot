import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ROLES } from "@gsc-pilot/business-rules";
import type { Employee } from "@gsc-pilot/shared";
import { AuthContext, type AuthContextValue } from "../../lib/auth/AuthContext.js";
import { ServiceCallList } from "./ServiceCallList.js";

const baseEmployee: Employee = {
  id: "11111111-1111-1111-1111-111111111111",
  authUserId: "22222222-2222-2222-2222-222222222222",
  name: "Test",
  initials: "TT",
  email: "test@gscpilot.local",
  persona: ROLES.MEMBER,
  skills: [],
  skillEfficiencies: {},
  costRate: 28,
  techLevelIds: [],
  active: true,
  createdAt: "2026-08-19T00:00:00.000Z",
  updatedAt: "2026-08-19T00:00:00.000Z",
};

function renderList(employee: Employee) {
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
        <ServiceCallList onOpen={() => {}} onCreate={() => {}} />
      </AuthContext.Provider>
    </QueryClientProvider>,
  );
}

describe("ServiceCallList", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        if (url.includes("/api/service-calls")) {
          return new Response(
            JSON.stringify({
              serviceCalls: [
                {
                  id: "sc1",
                  displayId: "CS-2026-0001",
                  status: "scheduled",
                  contactName: "Alex Client",
                  company: "Client inc.",
                  request: "Bris de convoyeur",
                  assignedEmployees: [{ id: "11111111-1111-1111-1111-111111111111", name: "Test" }],
                  scheduledAt: null,
                  createdAt: "2026-08-19T00:00:00.000Z",
                },
              ],
            }),
            { status: 200 },
          );
        }
        return new Response("{}", { status: 200 });
      }),
    );
  });

  it("affiche les appels de service et masque le bouton de création pour un Employé", async () => {
    renderList(baseEmployee);
    await waitFor(() => expect(screen.getByText("CS-2026-0001")).toBeInTheDocument());
    expect(screen.getByText("Bris de convoyeur")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "+ Nouvel appel" })).not.toBeInTheDocument();
  });

  it("affiche le bouton de création pour Direction", async () => {
    renderList({ ...baseEmployee, persona: ROLES.OWNER });
    await waitFor(() => expect(screen.getByRole("button", { name: "+ Nouvel appel" })).toBeInTheDocument());
  });
});
