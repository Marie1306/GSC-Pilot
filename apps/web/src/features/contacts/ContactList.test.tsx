import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ContactList } from "./ContactList.js";

function renderList() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <ContactList onOpen={() => {}} onCreate={() => {}} />
    </QueryClientProvider>,
  );
}

describe("ContactList", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        if (url.includes("/api/contacts")) {
          return new Response(
            JSON.stringify({
              contacts: [
                {
                  id: "c1",
                  type: "Client",
                  company: "Client inc.",
                  name: "Alex Client",
                  role: "Contact client",
                  email: "alex@example.com",
                  phone: "514-555-0000",
                  categories: ["Client", "Projet"],
                  createdAt: "2026-08-19T00:00:00.000Z",
                },
                {
                  id: "c2",
                  type: "Fournisseur",
                  company: "Pièces inc.",
                  name: "Sam Fournisseur",
                  role: null,
                  email: null,
                  phone: null,
                  categories: ["Fournisseur"],
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

  it("affiche les contacts et filtre par recherche", async () => {
    renderList();
    await waitFor(() => expect(screen.getByText("Alex Client")).toBeInTheDocument());
    expect(screen.getByText("Sam Fournisseur")).toBeInTheDocument();

    fireEvent.change(screen.getByPlaceholderText("Rechercher par nom, entreprise ou courriel…"), { target: { value: "fournisseur" } });
    expect(screen.queryByText("Alex Client")).not.toBeInTheDocument();
    expect(screen.getByText("Sam Fournisseur")).toBeInTheDocument();
  });
});
