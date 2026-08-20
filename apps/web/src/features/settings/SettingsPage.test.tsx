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
        if (url.includes("/api/settings/tech-levels")) {
          return new Response(JSON.stringify({ techLevels: [] }), { status: 200 });
        }
        if (url.includes("/api/employees")) {
          return new Response(JSON.stringify({ employees: [] }), { status: 200 });
        }
        if (url.includes("/api/settings/sales-channels")) {
          return new Response(JSON.stringify({ salesChannels: [] }), { status: 200 });
        }
        if (url.includes("/api/settings/punchable-tasks")) {
          return new Response(JSON.stringify({ tasks: [] }), { status: 200 });
        }
        if (url.includes("/api/settings/service-rates")) {
          return new Response(
            JSON.stringify({ rates: { mileageRate: 0, breakfastRate: 0, lunchRate: 0, dinnerRate: 0, servicePartsDefaultMarginPct: 0, urgencyFee: 0 } }),
            { status: 200 },
          );
        }
        if (url.includes("/api/settings/billing-split")) {
          return new Response(JSON.stringify({ steps: [{ label: "Étape 1", pct: 100 }] }), { status: 200 });
        }
        if (url.includes("/api/settings/budget-model-rate")) {
          return new Response(JSON.stringify({ backupHourlyRate: 112 }), { status: 200 });
        }
        if (url.includes("/api/settings/audit-log")) {
          return new Response(JSON.stringify({ entries: [] }), { status: 200 });
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
