import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ROLES } from "@gsc-pilot/business-rules";
import type { Employee } from "@gsc-pilot/shared";
import { AuthContext, type AuthContextValue } from "../../lib/auth/AuthContext.js";
import { ProjectList } from "./ProjectList.js";

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

function renderList(persona: Employee["persona"]) {
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
        <ProjectList onOpen={() => {}} onCreate={() => {}} />
      </QueryClientProvider>
    </AuthContext.Provider>,
  );
}

describe("ProjectList — bouton « Nouveau projet »", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify({ projects: [] }), { status: 200 })),
    );
  });

  it("visible pour la Direction (canCreateProjectDirectly)", () => {
    renderList(ROLES.OWNER);
    expect(screen.getByRole("button", { name: "+ Nouveau projet" })).toBeInTheDocument();
  });

  it("visible pour le Propriétaire", () => {
    renderList(ROLES.BOSS);
    expect(screen.getByRole("button", { name: "+ Nouveau projet" })).toBeInTheDocument();
  });

  it("absent pour l'Administration — peut voir les projets mais pas en créer (confirmé 9 août 2026)", () => {
    renderList(ROLES.ADMIN);
    expect(screen.queryByRole("button", { name: "+ Nouveau projet" })).not.toBeInTheDocument();
  });
});
