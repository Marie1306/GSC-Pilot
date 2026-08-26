import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ROLES } from "@gsc-pilot/business-rules";
import type { Employee } from "@gsc-pilot/shared";
import { AuthContext, type AuthContextValue } from "../../lib/auth/AuthContext.js";
import { ProjectInvoicePlan } from "./ProjectInvoicePlan.js";
import type { InvoicePlanEntryDto } from "./api.js";

const PROJECT_ID = "10000000-0000-0000-0000-000000000000";

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

function baseEntry(overrides: Partial<InvoicePlanEntryDto> = {}): InvoicePlanEntryDto {
  return {
    id: "entry-1",
    label: "Après conception",
    pct: 30,
    amount: 3000,
    status: "pending",
    invoiceNumber: null,
    dueDate: null,
    paidAmount: 0,
    paidAt: null,
    isExtra: false,
    requestedById: null,
    requestedAt: null,
    processedById: null,
    processedAt: null,
    ...overrides,
  };
}

function twoUntouchedEntries(): InvoicePlanEntryDto[] {
  return [
    baseEntry({ id: "entry-1", label: "Après conception", pct: 30, amount: 3000 }),
    baseEntry({ id: "entry-2", label: "Après installation", pct: 70, amount: 7000 }),
  ];
}

function renderPlan(persona: Employee["persona"], entries: InvoicePlanEntryDto[], fetchMock: ReturnType<typeof vi.fn>) {
  vi.stubGlobal("fetch", fetchMock);
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const authValue: AuthContextValue = {
    session: null,
    employee: { ...baseEmployee, persona },
    loading: false,
    error: null,
    signIn: async () => ({ error: null }),
    signOut: async () => {},
  };
  void entries;
  return render(
    <AuthContext.Provider value={authValue}>
      <QueryClientProvider client={queryClient}>
        <ProjectInvoicePlan projectId={PROJECT_ID} />
      </QueryClientProvider>
    </AuthContext.Provider>,
  );
}

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), { status: 200, headers: { "Content-Type": "application/json" } });
}

describe("ProjectInvoicePlan — cycle personnalisé (26 août 2026)", () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
  });

  it("« Modifier le cycle » visible pour la Direction quand aucun jalon n'a progressé", async () => {
    const entries = twoUntouchedEntries();
    const fetchMock = vi.fn(async () => jsonResponse({ entries }));
    renderPlan(ROLES.OWNER, entries, fetchMock);

    expect(await screen.findByText("Après conception")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Modifier le cycle" })).toBeInTheDocument();
  });

  it("« Modifier le cycle » absent pour l'Administration (canRequestInvoice = Direction seulement)", async () => {
    const entries = twoUntouchedEntries();
    const fetchMock = vi.fn(async () => jsonResponse({ entries }));
    renderPlan(ROLES.ADMIN, entries, fetchMock);

    expect(await screen.findByText("Après conception")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Modifier le cycle" })).not.toBeInTheDocument();
  });

  it("« Modifier le cycle » disparaît une fois qu'un jalon a déjà été demandé — même condition que le blocage 409 serveur", async () => {
    const entries = [
      baseEntry({ id: "entry-1", label: "Après conception", pct: 30, amount: 3000, requestedAt: "2026-08-20T00:00:00.000Z" }),
      baseEntry({ id: "entry-2", label: "Après installation", pct: 70, amount: 7000 }),
    ];
    const fetchMock = vi.fn(async () => jsonResponse({ entries }));
    renderPlan(ROLES.OWNER, entries, fetchMock);

    expect(await screen.findByText("Après conception")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Modifier le cycle" })).not.toBeInTheDocument();
  });

  it("ouvrir l'éditeur, invalider le total désactive Enregistrer, corriger le total le réactive, puis soumet le PUT avec les nouveaux jalons", async () => {
    const entries = twoUntouchedEntries();
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith("/invoice-plan") && (!init || !init.method || init.method === "GET")) {
        return jsonResponse({ entries });
      }
      if (url.endsWith("/invoice-plan") && init?.method === "PUT") {
        return jsonResponse({ entries: [] });
      }
      throw new Error(`URL inattendue dans le test: ${url}`);
    });
    renderPlan(ROLES.OWNER, entries, fetchMock);

    fireEvent.click(await screen.findByRole("button", { name: "Modifier le cycle" }));

    const pctInputs = screen.getAllByPlaceholderText("%") as HTMLInputElement[];
    expect(pctInputs).toHaveLength(2);
    expect(screen.getByText("Total : 100 %")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Enregistrer le cycle" })).not.toBeDisabled();

    // Un total invalide (110 %) doit bloquer la soumission — même règle que
    // le serveur (Math.round(totalPct) !== 100).
    fireEvent.change(pctInputs[0]!, { target: { value: "40" } });
    expect(screen.getByText("Total : 110 %")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Enregistrer le cycle" })).toBeDisabled();

    // Revenir à 100 % réactive Enregistrer.
    fireEvent.change(pctInputs[0]!, { target: { value: "30" } });
    expect(screen.getByText("Total : 100 %")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Enregistrer le cycle" })).not.toBeDisabled();

    const labelInputs = screen.getAllByPlaceholderText("Nom du jalon") as HTMLInputElement[];
    fireEvent.change(labelInputs[1]!, { target: { value: "Après livraison" } });

    fireEvent.click(screen.getByRole("button", { name: "Enregistrer le cycle" }));

    await waitFor(() => {
      const putCall = fetchMock.mock.calls.find(([, init]) => (init as RequestInit | undefined)?.method === "PUT");
      expect(putCall).toBeDefined();
      const [, init] = putCall!;
      const body = JSON.parse((init as RequestInit).body as string);
      expect(body).toEqual({
        steps: [
          { label: "Après conception", pct: 30 },
          { label: "Après livraison", pct: 70 },
        ],
      });
    });
  });
});
