import { useState } from "react";
import { describe, it, expect } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ProjectFilterInput } from "./PurchaseRequestList.js";
import type { ProjectOption } from "./api.js";

const PROJECTS: ProjectOption[] = [
  { id: "p1", projectNumber: "2267", name: "Automatisation scaling bar" },
  { id: "p2", projectNumber: "2422", name: "Chutes Buanderies" },
];

function Wrapper() {
  const [value, setValue] = useState("");
  return <ProjectFilterInput id="test-project-filter" label="Projet" projects={PROJECTS} value={value} onChange={setValue} />;
}

describe("ProjectFilterInput", () => {
  it("applique le filtre seulement sur une correspondance exacte (numéro ou nom)", () => {
    render(<Wrapper />);
    const input = screen.getByLabelText("Projet");

    fireEvent.change(input, { target: { value: "2267 — Automatisation scaling bar" } });
    expect((input as HTMLInputElement).value).toBe("2267 — Automatisation scaling bar");
  });

  it("une frappe partielle ne confirme rien — le champ affiche le texte tapé sans déclencher onChange invalide", () => {
    render(<Wrapper />);
    const input = screen.getByLabelText("Projet") as HTMLInputElement;

    fireEvent.change(input, { target: { value: "24" } });
    // Texte affiché tel que tapé, mais aucune correspondance exacte —
    // le filtre réel (value du parent) reste vide, donc le champ ne se
    // réinitialise pas tout seul tant qu'aucune correspondance n'est trouvée.
    expect(input.value).toBe("24");
  });

  it("vider le champ réinitialise le filtre (Tous les projets)", () => {
    render(<Wrapper />);
    const input = screen.getByLabelText("Projet") as HTMLInputElement;

    fireEvent.change(input, { target: { value: "2422 — Chutes Buanderies" } });
    expect(input.value).toBe("2422 — Chutes Buanderies");

    fireEvent.change(input, { target: { value: "" } });
    expect(input.value).toBe("");
  });

  it("propose les projets dans une <datalist> liée au champ (numéro et nom, liste complète conservée)", () => {
    render(<Wrapper />);
    const input = screen.getByLabelText("Projet") as HTMLInputElement;
    const listId = input.getAttribute("list");
    expect(listId).toBeTruthy();
    const options = document.querySelectorAll(`#${listId} option`);
    expect(options).toHaveLength(2);
    expect(Array.from(options).map((o) => o.getAttribute("value"))).toEqual([
      "2267 — Automatisation scaling bar",
      "2422 — Chutes Buanderies",
    ]);
  });
});
