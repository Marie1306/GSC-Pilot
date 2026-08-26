import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { EmployeeDrawer } from "./EmployeeDrawer.js";
import type { EmployeeDto } from "./api.js";

const baseEmployee: EmployeeDto = {
  id: "emp-1",
  name: "Test Employé",
  initials: "TE",
  email: "test-employe@gscpilot.local",
  phone: null,
  persona: "member",
  jobTitle: null,
  skills: [],
  skillEfficiencies: {},
  active: true,
  costRate: 28,
  techLevelIds: [],
};

/**
 * Vérifie que les cases "Classes facturables" se basculent sans effacer un
 * basculement précédent — l'ancienne version lisait techLevelIds depuis la
 * prop `employee` figée plutôt que depuis le cache React Query en direct,
 * ce qui aurait annulé le premier choix au deuxième clic.
 */
describe("EmployeeDrawer — classes facturables", () => {
  let serverTechLevelIds: string[];

  beforeEach(() => {
    serverTechLevelIds = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init?: RequestInit) => {
        if (url.includes("/api/settings/tech-levels")) {
          return new Response(
            JSON.stringify({
              techLevels: [
                { id: "tl-1", label: "Technicien régulier", regularRate: 112, overtimeRate: 125, extraRate: 140, active: true, sortOrder: 0 },
                { id: "tl-2", label: "Technicien senior", regularRate: 125, overtimeRate: 140, extraRate: 165, active: true, sortOrder: 1 },
              ],
            }),
            { status: 200 },
          );
        }
        if (url.includes("/tech-levels") && init?.method === "PATCH") {
          serverTechLevelIds = JSON.parse(init.body as string).techLevelIds;
          return new Response(JSON.stringify({ employee: { ...baseEmployee, techLevelIds: serverTechLevelIds } }), { status: 200 });
        }
        if (url.includes("/api/employees")) {
          return new Response(JSON.stringify({ employees: [{ ...baseEmployee, techLevelIds: serverTechLevelIds }] }), { status: 200 });
        }
        return new Response("{}", { status: 200 });
      }),
    );
  });

  it("accumule les classes cochées au lieu d'écraser le choix précédent", async () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={queryClient}>
        <EmployeeDrawer employee={baseEmployee} onClose={() => {}} />
      </QueryClientProvider>,
    );

    await waitFor(() => expect(screen.getByText("Technicien régulier")).toBeInTheDocument());

    const regular = screen.getByRole("checkbox", { name: /Technicien régulier/ });
    const senior = screen.getByRole("checkbox", { name: /Technicien senior/ });

    regular.click();
    await waitFor(() => expect(serverTechLevelIds).toEqual(["tl-1"]));
    await waitFor(() => expect(regular).toBeChecked());

    senior.click();
    await waitFor(() => expect(serverTechLevelIds).toEqual(["tl-1", "tl-2"]));
  });
});
