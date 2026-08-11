import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import { ROLES } from "@gsc-pilot/business-rules";
import type { Employee } from "@gsc-pilot/shared";
import { AuthContext, type AuthContextValue } from "./AuthContext.js";
import { RequireRole } from "./RequireRole.js";

const baseEmployee: Employee = {
  id: "00000000-0000-0000-0000-000000000000",
  authUserId: "00000000-0000-0000-0000-000000000001",
  name: "Test",
  initials: "T",
  email: "test@gscpilot.local",
  persona: ROLES.MEMBER,
  skills: [],
  skillEfficiencies: {},
  costRate: 0,
  techLevelId: null,
  active: true,
  createdAt: "2026-08-11T00:00:00.000Z",
  updatedAt: "2026-08-11T00:00:00.000Z",
};

function renderWithAuth(value: Partial<AuthContextValue>) {
  const fullValue: AuthContextValue = {
    session: null,
    employee: null,
    loading: false,
    error: null,
    signIn: async () => ({ error: null }),
    signOut: async () => {},
    ...value,
  };

  return render(
    <AuthContext.Provider value={fullValue}>
      <MemoryRouter initialEntries={["/budgetaire"]}>
        <Routes>
          <Route path="/connexion" element={<div>Écran de connexion</div>} />
          <Route path="/" element={<div>Tableau de bord</div>} />
          <Route
            path="/budgetaire"
            element={
              <RequireRole allow={(persona) => persona !== ROLES.MEMBER && persona !== ROLES.WAREHOUSE}>
                <div>Contenu du budgétaire</div>
              </RequireRole>
            }
          />
        </Routes>
      </MemoryRouter>
    </AuthContext.Provider>,
  );
}

describe("RequireRole", () => {
  it("affiche un état de chargement pendant que la session se résout", () => {
    renderWithAuth({ loading: true });
    expect(screen.getByText("Chargement…")).toBeInTheDocument();
  });

  it("redirige vers /connexion si personne n'est authentifié", () => {
    renderWithAuth({ employee: null });
    expect(screen.getByText("Écran de connexion")).toBeInTheDocument();
  });

  it("redirige vers le tableau de bord si le rôle n'est pas autorisé (Employé sur le budgétaire)", () => {
    renderWithAuth({ employee: { ...baseEmployee, persona: ROLES.MEMBER } });
    expect(screen.getByText("Tableau de bord")).toBeInTheDocument();
  });

  it("affiche le contenu pour un rôle autorisé (Direction)", () => {
    renderWithAuth({ employee: { ...baseEmployee, persona: ROLES.OWNER } });
    expect(screen.getByText("Contenu du budgétaire")).toBeInTheDocument();
  });
});
