import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter, createMemoryRouter, RouterProvider } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ROLES } from "@gsc-pilot/business-rules";
import type { Employee } from "@gsc-pilot/shared";
import { AuthContext, type AuthContextValue } from "../../lib/auth/AuthContext.js";
import { ActionCenterPage } from "./ActionCenterPage.js";

const employe: Employee = {
  id: "11111111-1111-1111-1111-111111111111",
  authUserId: "22222222-2222-2222-2222-222222222222",
  name: "Test Employé",
  initials: "TE",
  email: "test-employe@gscpilot.local",
  persona: ROLES.MEMBER,
  skills: [],
  skillEfficiencies: {},
  costRate: 0,
  techLevelIds: [],
  active: true,
  createdAt: "2026-08-11T00:00:00.000Z",
  updatedAt: "2026-08-11T00:00:00.000Z",
};

const noteId = "33333333-3333-3333-3333-333333333333";

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const authValue: AuthContextValue = {
    session: null,
    employee: employe,
    loading: false,
    error: null,
    signIn: async () => ({ error: null }),
    signOut: async () => {},
  };
  return render(
    <MemoryRouter>
      <AuthContext.Provider value={authValue}>
        <QueryClientProvider client={queryClient}>
          <ActionCenterPage />
        </QueryClientProvider>
      </AuthContext.Provider>
    </MemoryRouter>,
  );
}

/**
 * Rapporté le 29 août 2026 (demande de l'utilisatrice) : le Centre d'actions
 * doit devenir accessible à Employé/Magasinier UNIQUEMENT pour y voir leurs
 * notes reçues — les 8 autres catégories restent réservées à Direction/
 * Administration/Propriétaire (canAccessOverviewViews, inchangé). Ce test
 * vérifie que pour un persona "member" : (1) la route restreinte
 * /api/action-center/items n'est jamais appelée (enabled: false côté
 * itemsQuery — sinon un 403 réel afficherait un message d'erreur trompeur),
 * (2) la note active s'affiche, (3) le bouton "✓ Reçu" l'archive réellement
 * (PATCH + réaffichage dans l'historique après invalidation).
 */
describe("ActionCenterPage — Notes reçues (accessible à tous les rôles)", () => {
  let read = false;
  let actionCenterItemsCalled = false;

  beforeEach(() => {
    read = false;
    actionCenterItemsCalled = false;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init?: RequestInit) => {
        if (url.includes("/api/action-center/items")) {
          actionCenterItemsCalled = true;
          return new Response(JSON.stringify({ error: "forbidden" }), { status: 403 });
        }
        if (init?.method === "POST" && url.includes(`/api/team-notes/${noteId}/read`)) {
          read = true;
          return new Response(null, { status: 204 });
        }
        if (url.includes("/api/team-notes/inbox")) {
          return new Response(
            JSON.stringify(
              read
                ? { active: [], recentArchived: [{ id: noteId, senderId: "x", senderName: "Test Direction", senderPersona: "owner", body: "Bien joué", createdAt: "2026-08-29T00:00:00.000Z", readAt: "2026-08-29T01:00:00.000Z" }] }
                : { active: [{ id: noteId, senderId: "x", senderName: "Test Direction", senderPersona: "owner", body: "Bien joué", createdAt: "2026-08-29T00:00:00.000Z", readAt: null }], recentArchived: [] },
            ),
            { status: 200 },
          );
        }
        return new Response("{}", { status: 200 });
      }),
    );
  });

  it("n'appelle jamais /api/action-center/items pour un persona Employé", async () => {
    renderPage();
    await screen.findByText("Bien joué");
    expect(actionCenterItemsCalled).toBe(false);
    expect(screen.queryByText("Impossible de charger le centre d'actions.")).not.toBeInTheDocument();
  });

  it("affiche la note active puis l'archive au clic sur ✓ Reçu", async () => {
    renderPage();
    await screen.findByText("Bien joué");
    expect(screen.getByText("Test Direction")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "✓ Reçu" }));

    await waitFor(() => expect(read).toBe(true));
    await waitFor(() => expect(screen.queryByRole("button", { name: "✓ Reçu" })).not.toBeInTheDocument());
    expect(screen.getByText("Afficher toutes les notes")).toBeInTheDocument();
  });

  /**
   * Rapporté le 31 août 2026 : « parfois la fenêtre contextuelle n'ouvre
   * pas » en cliquant "Envoyer une note" dans Ajouter rapidement. Cause
   * confirmée : ce bouton est accessible depuis N'IMPORTE QUELLE page — en
   * cliquant dessus alors qu'on est DÉJÀ sur Centre d'actions, React Router
   * ne démonte jamais ce composant (même route), donc un useState(() =>
   * searchParams.get("compose")) qui ne s'évalue qu'au montage ne se
   * redéclenche jamais. Reproduit ici avec createMemoryRouter : on démarre
   * SANS ?compose=note (déjà sur Centre d'actions), puis on navigue vers la
   * même route AVEC ?compose=note (exactement ce que fait QuickAdd.tsx) —
   * la modale doit s'ouvrir.
   */
  it("ouvre la modale d'envoi même en renaviguant vers Centre d'actions depuis Centre d'actions lui-même", async () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const authValue: AuthContextValue = {
      session: null,
      employee: employe,
      loading: false,
      error: null,
      signIn: async () => ({ error: null }),
      signOut: async () => {},
    };
    const router = createMemoryRouter([{ path: "/centre-actions", element: <ActionCenterPage /> }], {
      initialEntries: ["/centre-actions"],
    });
    render(
      <AuthContext.Provider value={authValue}>
        <QueryClientProvider client={queryClient}>
          <RouterProvider router={router} />
        </QueryClientProvider>
      </AuthContext.Provider>,
    );

    await screen.findByText("Bien joué");
    expect(screen.queryByText("✉️ Envoyer une note")).not.toBeInTheDocument();

    // Même navigation que QuickAdd.tsx : navigate("/centre-actions?compose=note").
    router.navigate("/centre-actions?compose=note");

    await waitFor(() => expect(screen.getByText("✉️ Envoyer une note")).toBeInTheDocument());
  });
});
