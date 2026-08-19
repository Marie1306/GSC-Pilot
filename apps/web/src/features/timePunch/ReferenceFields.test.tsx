import { useState } from "react";
import { describe, it, expect } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ReferenceFields, type ReferenceValue } from "./ReferenceFields.js";
import type { PunchableTaskDto } from "./api.js";

const TASKS: PunchableTaskDto[] = [
  { id: "t-conception-1", category: "conception", categoryLabel: "Conception", label: "Dessin", scope: "project" },
  { id: "t-fab-plasma", category: "fabrication", categoryLabel: "Fabrication", label: "Plasma", scope: "project" },
  { id: "t-fab-pliage", category: "fabrication", categoryLabel: "Fabrication", label: "Pliage", scope: "project" },
  { id: "t-fab-soudage", category: "fabrication", categoryLabel: "Fabrication", label: "Soudage / Montage", scope: "project" },
];

function Harness({ initial }: { initial: ReferenceValue }) {
  const [value, setValue] = useState<ReferenceValue>(initial);
  return (
    <ReferenceFields
      value={value}
      onChange={(patch) => setValue((current) => ({ ...current, ...patch }))}
      tasks={TASKS}
      projects={[]}
      serviceCalls={[]}
      employeeTechLevelIds={[]}
      techLevels={[]}
      showRate={false}
    />
  );
}

describe("ReferenceFields — cascade catégorie → tâche", () => {
  it("la tâche ne montre d'abord que les options de la catégorie sélectionnée par défaut (ordre canonique : Conception avant Fabrication)", () => {
    render(<Harness initial={{ projectType: "project", taskId: "" }} />);
    expect(screen.getByLabelText("Catégorie")).toHaveValue("conception");
    const taskOptions = screen.getAllByRole("option", { name: /Dessin|Plasma|Pliage|Soudage/ });
    expect(taskOptions.map((o) => o.textContent)).toEqual(["Dessin"]);
  });

  it("changer de catégorie affiche les tâches de cette catégorie et sélectionne la première", () => {
    render(<Harness initial={{ projectType: "project", taskId: "" }} />);
    fireEvent.change(screen.getByLabelText("Catégorie"), { target: { value: "fabrication" } });

    expect(screen.getByLabelText("Tâche")).toHaveValue("t-fab-plasma");
    const taskOptions = screen.getAllByRole("option", { name: /Dessin|Plasma|Pliage|Soudage/ });
    expect(taskOptions.map((o) => o.textContent)).toEqual(["Plasma", "Pliage", "Soudage / Montage"]);
  });

  it("la catégorie se déduit de la tâche déjà choisie (édition d'un punch existant)", () => {
    render(<Harness initial={{ projectType: "project", taskId: "t-fab-pliage" }} />);
    expect(screen.getByLabelText("Catégorie")).toHaveValue("fabrication");
    expect(screen.getByLabelText("Tâche")).toHaveValue("t-fab-pliage");
  });
});
