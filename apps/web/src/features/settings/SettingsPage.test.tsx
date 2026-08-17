import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { SettingsPage } from "./SettingsPage.js";

describe("SettingsPage", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        if (url.includes("/api/settings/purchase-categories")) {
          return new Response(
            JSON.stringify({ categories: [{ id: "c1", name: "Outillage", thresholdAmount: 1000, active: true, sortOrder: 0 }] }),
            { status: 200 },
          );
        }
        if (url.includes("/api/settings/margin-thresholds")) {
          return new Response(JSON.stringify({ thresholds: { conformeThreshold: 30, atRiskThreshold: 25 } }), { status: 200 });
        }
        return new Response("{}", { status: 200 });
      }),
    );
  });

  it("affiche les catégories d'achat existantes", async () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={queryClient}>
        <SettingsPage />
      </QueryClientProvider>,
    );
    await waitFor(() => expect(screen.getByDisplayValue("Outillage")).toBeInTheDocument());
    expect(screen.getByDisplayValue("1000")).toBeInTheDocument();
  });
});
