// Porté 1-pour-1 depuis docs/handoff/03-modules-v01/subassembly.test.js (31 assertions).
import { describe, it, expect } from "vitest";
import {
  declareSubassemblyReady,
  markPartsListReady,
  subassemblyGanttTasks,
  declareAssemblyReady,
  designerHistory,
  type Subassembly,
} from "../src/subassembly.js";

describe("Déclaration (exemple réel : projet 2250, assemblage 01-000, format réel)", () => {
  it("identifiant construit, statut initial, un seul enregistré", () => {
    const subassemblies: Subassembly[] = [];
    const entry = declareSubassemblyReady(subassemblies, { projectId: "2250", number: "01-000", declaredBy: "Marc" });
    expect(entry.id).toBe("2250-01-000");
    expect(entry.status).toBe("pending_parts_list");
    expect(subassemblies.length).toBe(1);
  });
});

describe("Pas d'ordre imposé — Marc saute d'un assemblage à l'autre", () => {
  it("l'historique respecte l'ordre réel de déclaration, pas l'ordre numérique", () => {
    const subassemblies: Subassembly[] = [];
    declareSubassemblyReady(subassemblies, { projectId: "2250", number: "04-000", declaredBy: "Marc" });
    declareSubassemblyReady(subassemblies, { projectId: "2250", number: "07-000", declaredBy: "Marc" });
    declareSubassemblyReady(subassemblies, { projectId: "2250", number: "01-000", declaredBy: "Marc" });
    const history = designerHistory(subassemblies, "Marc");
    expect(history.map((h) => h.number).join(",")).toBe("04-000,07-000,01-000");
  });
});

describe("Doublon refusé", () => {
  it("refuse de déclarer le même sous-assemblage deux fois", () => {
    const subassemblies: Subassembly[] = [];
    declareSubassemblyReady(subassemblies, { projectId: "2250", number: "01-000", declaredBy: "Marc" });
    expect(() => declareSubassemblyReady(subassemblies, { projectId: "2250", number: "01-000", declaredBy: "Marc" })).toThrow();
  });
});

describe("Création de la liste de pièces par la Direction (avec heures réelles du sous-assemblage)", () => {
  it("devient planifiable pour la production, traçabilité conservée", () => {
    const subassemblies: Subassembly[] = [];
    const entry = declareSubassemblyReady(subassemblies, { projectId: "2250", number: "02-000", declaredBy: "Marc" });
    markPartsListReady(entry, "owner", { fabrication: 40 });
    expect(entry.status).toBe("ready_for_production");
    expect(entry.partsListPreparedBy).toBe("owner");
  });

  it("refuse de refaire la liste de pièces d'un sous-assemblage déjà prêt", () => {
    const subassemblies: Subassembly[] = [];
    const entry = declareSubassemblyReady(subassemblies, { projectId: "2250", number: "03-000", declaredBy: "Marc" });
    markPartsListReady(entry, "owner", { fabrication: 20 });
    expect(() => markPartsListReady(entry, "owner", { fabrication: 20 })).toThrow();
  });

  it("refuse une liste de pièces sans aucune heure", () => {
    const subassemblies: Subassembly[] = [];
    const entry = declareSubassemblyReady(subassemblies, { projectId: "2250", number: "05-000", declaredBy: "Marc" });
    expect(() => markPartsListReady(entry, "owner", {})).toThrow();
  });
});

describe("Tâches Gantt générées — sous-assemblage sans programmation", () => {
  it("une seule tâche, aucune dépendance, heures exactes", () => {
    const subassemblies: Subassembly[] = [];
    const entry = declareSubassemblyReady(subassemblies, { projectId: "2250", number: "02-000", declaredBy: "Marc" });
    markPartsListReady(entry, "owner", { fabrication: 40 });
    const tasks = subassemblyGanttTasks(entry);
    expect(tasks.length).toBe(1);
    expect(tasks[0]?.dependencies.length).toBe(0);
    expect(tasks[0]?.hours).toBe(40);
  });
});

describe("Tâches Gantt générées — avec programmation, fractionnée en deux (exemple discuté)", () => {
  it("trois tâches, programmation fractionnée avec dépendance sur la fabrication", () => {
    const subassemblies: Subassembly[] = [];
    const entry = declareSubassemblyReady(subassemblies, { projectId: "2250", number: "08-000", declaredBy: "Marc" });
    markPartsListReady(entry, "owner", { fabrication: 40, programmation: 10 });
    const tasks = subassemblyGanttTasks(entry);
    expect(tasks.length).toBe(3);

    const fabrication = tasks.find((t) => t.category === "fabrication");
    const prog1 = tasks.find((t) => t.id.endsWith("programmation-1"));
    const prog2 = tasks.find((t) => t.id.endsWith("programmation-2"));

    expect(fabrication?.dependencies.length).toBe(0);
    expect(prog1?.dependencies.length).toBe(0);
    expect(prog1?.hours).toBe(5);
    expect(prog2?.dependencies[0]).toBe(fabrication?.id);
    expect(prog2?.hours).toBe(5);
  });

  it("aucune heure perdue à l'arrondi (3,5 + 3,5 = 7)", () => {
    const subassemblies: Subassembly[] = [];
    const entry = declareSubassemblyReady(subassemblies, { projectId: "2250", number: "09-000", declaredBy: "Marc" });
    markPartsListReady(entry, "owner", { fabrication: 15, programmation: 7 });
    const tasks = subassemblyGanttTasks(entry);
    const totalProgrammation = tasks.filter((t) => t.category === "programmation").reduce((sum, t) => sum + t.hours, 0);
    expect(totalProgrammation).toBe(7);
  });
});

describe("Sous-catégories de fabrication multiples (précisé le 9 août)", () => {
  it("4 sous-catégories détectées, débloquées immédiatement, programmation attend les 4", () => {
    const subassemblies: Subassembly[] = [];
    const entry = declareSubassemblyReady(subassemblies, { projectId: "2250", number: "11-000", declaredBy: "Marc" });
    markPartsListReady(entry, "owner", {
      "fabrication-plasma": 10,
      "fabrication-pliage": 8,
      "fabrication-usinage": 12,
      "fabrication-soudage": 6,
      programmation: 10,
      assemblage: 20,
    });
    const tasks = subassemblyGanttTasks(entry);
    const fabTasks = tasks.filter((t) => t.category.startsWith("fabrication-"));
    const prog2 = tasks.find((t) => t.id.endsWith("programmation-2"));
    const fabIds = fabTasks.map((t) => t.id).sort();

    expect(fabTasks.length).toBe(4);
    expect(fabTasks.every((t) => t.dependencies.length === 0)).toBe(true);
    expect([...(prog2?.dependencies ?? [])].sort().join(",")).toBe(fabIds.join(","));
    expect(tasks.some((t) => t.category === "assemblage")).toBe(false);
  });
});

describe("Assemblage débloquée par geste explicite de Direction (confirmé le 9 août)", () => {
  it("absente avant le geste, présente et correcte après", () => {
    const subassemblies: Subassembly[] = [];
    const entry = declareSubassemblyReady(subassemblies, { projectId: "2250", number: "13-000", declaredBy: "Marc" });
    markPartsListReady(entry, "owner", { "fabrication-usinage": 20, "fabrication-soudage": 15, assemblage: 12 });

    let tasks = subassemblyGanttTasks(entry);
    expect(tasks.some((t) => t.category === "assemblage")).toBe(false);

    declareAssemblyReady(entry, "owner");
    tasks = subassemblyGanttTasks(entry);
    const assemblage = tasks.find((t) => t.category === "assemblage");
    expect(!!assemblage).toBe(true);
    expect(assemblage?.dependencies.length).toBe(0);
    expect(assemblage?.hours).toBe(12);
    expect(assemblage?.releasedBy).toBe("owner");
  });

  it("refuse de débloquer un assemblage qui n'a jamais été estimé", () => {
    const subassemblies: Subassembly[] = [];
    const entry = declareSubassemblyReady(subassemblies, { projectId: "2250", number: "14-000", declaredBy: "Marc" });
    markPartsListReady(entry, "owner", { "fabrication-usinage": 20 }); // pas d'assemblage déclaré du tout
    expect(() => declareAssemblyReady(entry, "owner")).toThrow();
  });

  it("refuse de débloquer l'assemblage avant même la liste de pièces", () => {
    const subassemblies: Subassembly[] = [];
    const entry = declareSubassemblyReady(subassemblies, { projectId: "2250", number: "15-000", declaredBy: "Marc" });
    expect(() => declareAssemblyReady(entry, "owner")).toThrow(); // liste de pièces pas encore créée
  });

  it("refuse de générer les tâches avant que la liste de pièces soit prête", () => {
    const subassemblies: Subassembly[] = [];
    const entry = declareSubassemblyReady(subassemblies, { projectId: "2250", number: "10-000", declaredBy: "Marc" });
    expect(() => subassemblyGanttTasks(entry)).toThrow();
  });
});
