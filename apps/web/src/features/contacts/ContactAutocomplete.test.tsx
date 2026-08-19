import { useState } from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ContactSearchField } from "./ContactAutocomplete.js";
import type { ContactListItemDto } from "./api.js";

function CompanyField({ onSelect }: { onSelect: (contact: ContactListItemDto) => void }) {
  const [value, setValue] = useState("");
  return <ContactSearchField id="cr-company" label="Entreprise" field="company" value={value} onChange={setValue} onSelect={onSelect} />;
}

function renderField(onSelect: (contact: ContactListItemDto) => void) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <CompanyField onSelect={onSelect} />
    </QueryClientProvider>,
  );
}

describe("ContactSearchField", () => {
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
                  company: "Automation Direct",
                  name: "Keven Tremblay",
                  role: "Acheteur",
                  email: "keven@automationdirect.example",
                  phone: "514-555-0001",
                  categories: [],
                  createdAt: "2026-08-19T00:00:00.000Z",
                },
                {
                  id: "c2",
                  type: "Client",
                  company: "WiAutomation",
                  name: "Sam Client",
                  role: null,
                  email: null,
                  phone: null,
                  categories: [],
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

  it("propose des suggestions par entreprise et remplit le contact sélectionné", async () => {
    const onSelect = vi.fn();
    renderField(onSelect);
    const input = screen.getByLabelText("Entreprise");

    fireEvent.change(input, { target: { value: "Automa" } });
    await waitFor(() => expect(screen.getByText("Automation Direct")).toBeInTheDocument());
    expect(screen.getByText("WiAutomation")).toBeInTheDocument();

    fireEvent.mouseDown(screen.getByText("Automation Direct"));
    expect(onSelect).toHaveBeenCalledWith(expect.objectContaining({ id: "c1", company: "Automation Direct", name: "Keven Tremblay" }));
  });

  it("n'affiche rien tant que le champ est vide", async () => {
    renderField(vi.fn());
    expect(screen.queryByText("Automation Direct")).not.toBeInTheDocument();
  });
});
