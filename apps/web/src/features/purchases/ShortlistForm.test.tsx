import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ShortlistForm } from "./ShortlistForm.js";

/**
 * Régression (23 novembre 2026) : une grosse liste saisie en code de
 * produit + quantité seulement (sans description) disparaissait
 * silencieusement à la soumission — voir le commentaire de ShortlistForm.tsx.
 * Rapporté par Marie après une perte réelle de données en production.
 */
function renderForm() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <ShortlistForm />
    </QueryClientProvider>,
  );
}

describe("ShortlistForm", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (url.includes("/api/purchase-requests/shortlist") && init?.method === "POST") {
        return new Response(JSON.stringify({ purchaseRequests: ["new-id"] }), { status: 201 });
      }
      if (url.includes("/api/projects")) {
        return new Response(JSON.stringify({ projects: [{ id: "p1", projectNumber: "PRJ-0001", name: "Projet test" }] }), { status: 200 });
      }
      return new Response("{}", { status: 200 });
    });
    vi.stubGlobal("fetch", fetchMock);
  });

  it("soumet une ligne identifiée par code de produit + quantité seulement, sans description", async () => {
    renderForm();

    await screen.findByText("PRJ-0001 — Projet test"); // attendre que la liste de projets soit chargée avant de sélectionner une valeur
    fireEvent.change(screen.getByLabelText("Projet (obligatoire)"), { target: { value: "p1" } });
    const firstProductCodeInput = screen.getAllByPlaceholderText("Ex. PS-120-12")[0]!;
    fireEvent.change(firstProductCodeInput, { target: { value: "PS-120-12" } });
    fireEvent.change(firstProductCodeInput.closest("tr")!.querySelector('input[type="number"]')!, {
      target: { value: "3" },
    });

    const submitButton = screen.getByRole("button", { name: "Soumettre la liste" });
    expect(submitButton).not.toBeDisabled();
    fireEvent.click(submitButton);

    await waitFor(() => expect(screen.getByText(/1 ligne\(s\) soumise\(s\)/)).toBeInTheDocument());

    const shortlistCall = fetchMock.mock.calls.find(([url]) => (url as string).includes("/api/purchase-requests/shortlist"));
    expect(shortlistCall).toBeDefined();
    const body = JSON.parse((shortlistCall![1] as RequestInit).body as string);
    expect(body.lines).toHaveLength(1);
    expect(body.lines[0]).toMatchObject({ productCode: "PS-120-12", qty: 3, description: "PS-120-12" });
  });

  it("n'active pas la soumission tant qu'aucune ligne n'a ni description ni code de produit", async () => {
    renderForm();
    await screen.findByText("PRJ-0001 — Projet test");
    fireEvent.change(screen.getByLabelText("Projet (obligatoire)"), { target: { value: "p1" } });
    expect(screen.getByRole("button", { name: "Soumettre la liste" })).toBeDisabled();
  });
});
