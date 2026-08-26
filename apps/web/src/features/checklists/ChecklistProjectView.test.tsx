import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ROLES } from "@gsc-pilot/business-rules";
import type { Employee } from "@gsc-pilot/shared";
import { AuthContext, type AuthContextValue } from "../../lib/auth/AuthContext.js";
import { ChecklistProjectView } from "./ChecklistProjectView.js";

const employee: Employee = {
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
  createdAt: "2026-08-19T00:00:00.000Z",
  updatedAt: "2026-08-19T00:00:00.000Z",
};

const DONE_STEP = { stepId: "step-mep", stepLabel: "MEP", active: true, completed: true, completedByName: null, completedAt: null };
const PENDING_STEP = { stepId: "step-mep", stepLabel: "MEP", active: true, completed: false, completedByName: null, completedAt: null };

function baseItem(overrides: Partial<Record<string, unknown>>) {
  return {
    checklistId: "checklist-1",
    parentItemId: null,
    parentNumber: null,
    quantity: null,
    thickness: null,
    material: null,
    shapeType: null,
    tubeShape: null,
    tubeOD: null,
    tubeID: null,
    tubeMeasurement1: null,
    tubeMeasurement2: null,
    tubeWallThickness: null,
    shaftMeasurement: null,
    note: null,
    createdByName: "Test Direction",
    createdAt: "2026-08-26T00:00:00.000Z",
    ...overrides,
  };
}

// Groupe A : sous-assemblage terminé, pièce enfant encore en attente — les
// deux doivent rester visibles (le sous-assemblage ne disparaît pas avant sa pièce).
const subA = baseItem({ id: "sa-1", kind: "subassembly", number: "SA-1-DONE", steps: [DONE_STEP] });
const pieceA = baseItem({ id: "p-1", kind: "piece", parentItemId: "sa-1", parentNumber: "SA-1-DONE", number: "P-1-PENDING", steps: [PENDING_STEP] });

// Groupe B : pièce terminée, sous-assemblage parent encore en attente — les
// deux doivent rester visibles (la pièce ne disparaît pas avant son sous-assemblage).
const subB = baseItem({ id: "sa-2", kind: "subassembly", number: "SA-2-PENDING", steps: [PENDING_STEP] });
const pieceB = baseItem({ id: "p-2", kind: "piece", parentItemId: "sa-2", parentNumber: "SA-2-PENDING", number: "P-2-DONE", steps: [DONE_STEP] });

// Groupe C : sous-assemblage ET pièce terminés — le groupe entier disparaît ensemble.
const subC = baseItem({ id: "sa-3", kind: "subassembly", number: "SA-3-BOTHDONE", steps: [DONE_STEP] });
const pieceC = baseItem({ id: "p-3", kind: "piece", parentItemId: "sa-3", parentNumber: "SA-3-BOTHDONE", number: "P-3-BOTHDONE", steps: [DONE_STEP] });

// Pièces orphelines (sans sous-assemblage) — comportement individuel inchangé.
const orphanDone = baseItem({ id: "p-4", kind: "piece", number: "ORPHAN-DONE", steps: [DONE_STEP] });
const orphanPending = baseItem({ id: "p-5", kind: "piece", number: "ORPHAN-PENDING", steps: [PENDING_STEP] });

function renderView() {
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
        <ChecklistProjectView projectId="project-1" initialChecklistId="checklist-1" onBack={() => {}} />
      </AuthContext.Provider>
    </QueryClientProvider>,
  );
}

describe("ChecklistProjectView — groupe sous-assemblage/pièces", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        if (url.includes("/api/checklists/steps")) {
          return new Response(JSON.stringify({ steps: [{ id: "step-mep", label: "MEP", active: true, sortOrder: 1 }] }), { status: 200 });
        }
        if (url.includes("/api/checklists/thicknesses")) {
          return new Response(JSON.stringify({ thicknesses: [] }), { status: 200 });
        }
        if (url.includes("/api/checklists/projects/project-1")) {
          return new Response(
            JSON.stringify({
              checklists: [
                {
                  id: "checklist-1",
                  projectId: "project-1",
                  projectNumber: "2356",
                  projectName: "test",
                  assemblyLabel: "08-000",
                  createdByName: "Test Direction",
                  createdAt: "2026-08-26T00:00:00.000Z",
                  items: [subA, pieceA, subB, pieceB, subC, pieceC, orphanDone, orphanPending],
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

  it("garde visible un sous-assemblage terminé tant que sa pièce ne l'est pas", async () => {
    renderView();
    await waitFor(() => expect(screen.getByText("P-1-PENDING")).toBeInTheDocument());
    // "SA-1-DONE" apparaît deux fois : la propre ligne du sous-assemblage (colonne Pièce)
    // et la colonne Sous-assemblage de sa pièce enfant (parentNumber) — les deux lignes existent bien.
    expect(screen.getAllByText("SA-1-DONE").length).toBe(2);
  });

  it("garde visible une pièce terminée tant que son sous-assemblage ne l'est pas", async () => {
    renderView();
    await waitFor(() => expect(screen.getByText("P-2-DONE")).toBeInTheDocument());
    expect(screen.getAllByText("SA-2-PENDING").length).toBe(2);
  });

  it("fait disparaître le sous-assemblage et sa pièce ensemble une fois les deux terminés", async () => {
    renderView();
    await waitFor(() => expect(screen.getByText("ORPHAN-PENDING")).toBeInTheDocument());
    expect(screen.queryByText("SA-3-BOTHDONE")).not.toBeInTheDocument();
    expect(screen.queryByText("P-3-BOTHDONE")).not.toBeInTheDocument();
  });

  it("laisse une pièce orpheline disparaître seule, indépendamment des groupes", async () => {
    renderView();
    await waitFor(() => expect(screen.getByText("ORPHAN-PENDING")).toBeInTheDocument());
    expect(screen.queryByText("ORPHAN-DONE")).not.toBeInTheDocument();
  });

  it("charge bien depuis la route accessible à l'Employé, pas la route archive (canAccessProject, 403 pour l'Employé) — écart trouvé et corrigé le 26 août 2026", async () => {
    // Simule exactement le bug rapporté : la route archive répondrait 403 à
    // un Employé, la nouvelle route (canAccessProductionChecklist) répond
    // 200. Si le composant appelait encore la mauvaise route par erreur, ce
    // test échouerait (jamais de "Chargement…" qui se termine).
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        if (url.includes("/api/checklists/steps")) {
          return new Response(JSON.stringify({ steps: [] }), { status: 200 });
        }
        if (url.includes("/api/checklists/thicknesses")) {
          return new Response(JSON.stringify({ thicknesses: [] }), { status: 200 });
        }
        if (url.includes("/api/projects/project-1/checklists")) {
          return new Response(JSON.stringify({ error: "forbidden" }), { status: 403 });
        }
        if (url.includes("/api/checklists/projects/project-1")) {
          return new Response(
            JSON.stringify({
              checklists: [
                {
                  id: "checklist-1",
                  projectId: "project-1",
                  projectNumber: "2356",
                  projectName: "test",
                  assemblyLabel: "08-000",
                  createdByName: "Test Direction",
                  createdAt: "2026-08-26T00:00:00.000Z",
                  items: [orphanPending],
                },
              ],
            }),
            { status: 200 },
          );
        }
        return new Response("{}", { status: 200 });
      }),
    );

    renderView();
    await waitFor(() => expect(screen.getByText("ORPHAN-PENDING")).toBeInTheDocument());
  });
});
