// Nouveau module (pas un port) — scénarios construits à partir de la
// spécification confirmée (semaine québécoise, cas Yannick, étirement par
// efficacité) et des décisions prises avec l'utilisatrice le 31 août 2026
// (bonus de priorité Roulement, interruptions, dérogation volontaire).
import { describe, it, expect } from "vitest";
import {
  QUEBEC_WEEKDAY_HOURS,
  GANTT_HORIZON_BUSINESS_DAYS,
  ROLLING_PRIORITY_BONUS,
  businessDaysFrom,
  baseDailyCapacityHours,
  employeeSkillEfficiency,
  validateInterruptionHours,
  runGanttSchedule,
  rollingGanttTasks,
  type GanttEmployee,
  type GanttTaskInput,
} from "../src/gantt-schedule.js";

/** Un lundi garanti, peu importe la date de départ — jamais un jour de semaine deviné à la main. */
function mondayOnOrAfter(date: Date): Date {
  const d = new Date(date);
  while (d.getDay() !== 1) d.setDate(d.getDate() + 1);
  return d;
}
const MONDAY = mondayOnOrAfter(new Date(2026, 8, 1)); // un lundi de septembre 2026, peu importe lequel exactement
function addDays(date: Date, days: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

function employee(id: string, skills: string[], skillEfficiencies: Record<string, number> = {}): GanttEmployee {
  return { id, skills, skillEfficiencies };
}
function task(overrides: Partial<GanttTaskInput> & { id: string; skill: string; plannedHours: number }): GanttTaskInput {
  return {
    ownerType: "project",
    ownerId: "proj-1",
    desiredStart: null,
    dependsOnIds: [],
    pinnedEmployeeId: null,
    priority: 0,
    deadline: null,
    ...overrides,
  };
}

describe("baseDailyCapacityHours — semaine québécoise confirmée", () => {
  it("lundi à jeudi : 8,5h", () => {
    for (let i = 0; i <= 3; i++) expect(baseDailyCapacityHours(addDays(MONDAY, i))).toBe(QUEBEC_WEEKDAY_HOURS.MON_THU);
  });
  it("vendredi : 4h", () => {
    expect(baseDailyCapacityHours(addDays(MONDAY, 4))).toBe(QUEBEC_WEEKDAY_HOURS.FRI);
  });
  it("samedi et dimanche : 0h", () => {
    expect(baseDailyCapacityHours(addDays(MONDAY, 5))).toBe(0);
    expect(baseDailyCapacityHours(addDays(MONDAY, 6))).toBe(0);
  });
});

describe("businessDaysFrom", () => {
  it("saute la fin de semaine — 6 jours ouvrables à partir d'un lundi couvrent 8 jours calendaires", () => {
    const days = businessDaysFrom(MONDAY, 6);
    expect(days).toHaveLength(6);
    expect(days.every((d) => d.getDay() !== 0 && d.getDay() !== 6)).toBe(true);
    // lun,mar,mer,jeu,ven puis lundi suivant (samedi/dimanche sautés)
    expect(days[5]!.getDate()).toBe(addDays(MONDAY, 7).getDate());
  });
});

describe("employeeSkillEfficiency — étirement calendrier confirmé (9 août 2026)", () => {
  it("pourcentage explicite : divisé par 100", () => {
    expect(employeeSkillEfficiency(employee("e1", ["usinage"], { usinage: 50 }), "usinage")).toBe(0.5);
  });
  it("pourcentage explicite très bas : plancher à 0,05", () => {
    expect(employeeSkillEfficiency(employee("e1", ["usinage"], { usinage: 1 }), "usinage")).toBe(0.05);
  });
  it("compétence listée sans pourcentage explicite : 100 %", () => {
    expect(employeeSkillEfficiency(employee("e1", ["usinage"]), "usinage")).toBe(1);
  });
  it("compétence absente : 0 (pas qualifié)", () => {
    expect(employeeSkillEfficiency(employee("e1", ["usinage"]), "soudage")).toBe(0);
  });
  it("pourcentage explicite de 0 retombe sur la vérification par liste (0 n'est pas > 0)", () => {
    expect(employeeSkillEfficiency(employee("e1", ["usinage"], { usinage: 0 }), "usinage")).toBe(1);
  });
  it("aucune compétence demandée : jamais qualifié automatiquement", () => {
    expect(employeeSkillEfficiency(employee("e1", ["usinage"]), null)).toBe(0);
  });
});

describe("validateInterruptionHours — validée contre la vraie capacité du jour", () => {
  it("accepte exactement la capacité de base d'un jour de semaine", () => {
    expect(() => validateInterruptionHours(MONDAY, QUEBEC_WEEKDAY_HOURS.MON_THU)).not.toThrow();
  });
  it("refuse plus que la capacité réelle d'un vendredi (4h, pas 8,5h)", () => {
    expect(() => validateInterruptionHours(addDays(MONDAY, 4), 8)).toThrow();
  });
  it("refuse zéro ou négatif", () => {
    expect(() => validateInterruptionHours(MONDAY, 0)).toThrow();
    expect(() => validateInterruptionHours(MONDAY, -1)).toThrow();
  });
});

describe("runGanttSchedule — goulot d'étranglement à un seul employé qualifié (cas Yannick, vérifié 9 août 2026)", () => {
  it("deux tâches, un seul programmeur qualifié : la plus prioritaire est servie en premier", () => {
    const yannick = employee("yannick", ["programmation"]);
    const result = runGanttSchedule({
      today: MONDAY,
      employees: [yannick],
      interruptions: [],
      tasks: [
        task({ id: "t-basse", skill: "programmation", plannedHours: 8.5, priority: 1 }),
        task({ id: "t-haute", skill: "programmation", plannedHours: 8.5, priority: 5 }),
      ],
    });
    const haute = result.tasks.find((t) => t.id === "t-haute")!;
    const basse = result.tasks.find((t) => t.id === "t-basse")!;
    expect(haute.predictedCompletedDate).toBe(result.horizonDays[0]); // servie en entier le premier jour (8,5h dispo = 8,5h requises)
    expect(basse.firstScheduledDate).toBe(result.horizonDays[1]); // repoussée au lendemain, aucune capacité restante le jour 1
  });
});

describe("runGanttSchedule — étirement calendrier par efficacité réduite", () => {
  it("20h réelles à 50 % d'efficacité prennent deux fois plus de jours qu'à 100 %", () => {
    const efficient = employee("e-100", ["usinage"]);
    const slow = employee("e-50", ["usinage"], { usinage: 50 });
    const withEfficient = runGanttSchedule({
      today: MONDAY,
      employees: [efficient],
      interruptions: [],
      tasks: [task({ id: "t1", skill: "usinage", plannedHours: 17 })], // 2 jours pleins à 8,5h
    });
    const withSlow = runGanttSchedule({
      today: MONDAY,
      employees: [slow],
      interruptions: [],
      tasks: [task({ id: "t1", skill: "usinage", plannedHours: 17 })],
    });
    const doneEfficient = withEfficient.tasks[0]!.predictedCompletedDate!;
    const doneSlow = withSlow.tasks[0]!.predictedCompletedDate!;
    const indexEfficient = withEfficient.horizonDays.indexOf(doneEfficient);
    const indexSlow = withSlow.horizonDays.indexOf(doneSlow);
    expect(indexSlow).toBeGreaterThan(indexEfficient);
  });
});

describe("runGanttSchedule — interruptions réduisent la capacité disponible", () => {
  it("une interruption employé réduit sa capacité ce jour-là seulement", () => {
    const emp = employee("e1", ["soudage"]);
    const result = runGanttSchedule({
      today: MONDAY,
      employees: [emp],
      interruptions: [{ employeeId: "e1", date: businessDaysFrom(MONDAY, 1).map((d) => d)[0]!.toISOString().slice(0, 10), hours: 4 }],
      tasks: [task({ id: "t1", skill: "soudage", plannedHours: 4.5 })],
    });
    expect(result.capacityByEmployeeDate[result.horizonDays[0]!]!["e1"]!.available).toBe(QUEBEC_WEEKDAY_HOURS.MON_THU - 4);
  });
  it("une interruption tout-atelier (employeeId nul) réduit la capacité de tous", () => {
    const day0 = businessDaysFrom(MONDAY, 1)[0]!.toISOString().slice(0, 10);
    const result = runGanttSchedule({
      today: MONDAY,
      employees: [employee("e1", ["soudage"]), employee("e2", ["soudage"])],
      interruptions: [{ employeeId: null, date: day0, hours: 8.5 }],
      tasks: [],
    });
    expect(result.capacityByEmployeeDate[result.horizonDays[0]!]!["e1"]!.available).toBe(0);
    expect(result.capacityByEmployeeDate[result.horizonDays[0]!]!["e2"]!.available).toBe(0);
  });
});

describe("runGanttSchedule — priorité qui déplace une tâche moins prioritaire", () => {
  it("une tâche urgente ajoutée après-coup repousse la date prédite d'une tâche déjà planifiée", () => {
    const emp = employee("e1", ["fabrication"]);
    const baseline = runGanttSchedule({
      today: MONDAY,
      employees: [emp],
      interruptions: [],
      tasks: [task({ id: "t-normale", skill: "fabrication", plannedHours: 17, priority: 1 })],
    });
    const withUrgent = runGanttSchedule({
      today: MONDAY,
      employees: [emp],
      interruptions: [],
      tasks: [
        task({ id: "t-normale", skill: "fabrication", plannedHours: 17, priority: 1 }),
        task({ id: "t-urgente", skill: "fabrication", plannedHours: 8.5, priority: 10 }),
      ],
    });
    const normaleBaseline = baseline.tasks.find((t) => t.id === "t-normale")!;
    const normaleDeplacee = withUrgent.tasks.find((t) => t.id === "t-normale")!;
    const indexBaseline = baseline.horizonDays.indexOf(normaleBaseline.predictedCompletedDate!);
    const indexDeplacee = withUrgent.horizonDays.indexOf(normaleDeplacee.predictedCompletedDate!);
    expect(indexDeplacee).toBeGreaterThan(indexBaseline);
  });
});

describe("runGanttSchedule — départage Roulement vs Projet (confirmé par l'utilisatrice, 31 août 2026)", () => {
  it("à priorité nominale égale, le bonus fait gagner la tâche de Roulement", () => {
    const emp = employee("e1", ["assemblage"]);
    const result = runGanttSchedule({
      today: MONDAY,
      employees: [emp],
      interruptions: [],
      tasks: [
        task({ id: "t-projet", ownerType: "project", ownerId: "proj-1", skill: "assemblage", plannedHours: 8.5, priority: 0 }),
        task({ id: "t-roulement", ownerType: "rolling", ownerId: "roul-1", skill: "assemblage", plannedHours: 8.5, priority: 0 + ROLLING_PRIORITY_BONUS }),
      ],
    });
    expect(result.tasks.find((t) => t.id === "t-roulement")!.predictedCompletedDate).toBe(result.horizonDays[0]);
    expect(result.tasks.find((t) => t.id === "t-projet")!.firstScheduledDate).toBe(result.horizonDays[1]);
  });
  it("un Projet à priorité manuelle assez haute passe quand même devant — le bonus n'est jamais absolu", () => {
    const emp = employee("e1", ["assemblage"]);
    const result = runGanttSchedule({
      today: MONDAY,
      employees: [emp],
      interruptions: [],
      tasks: [
        task({ id: "t-projet-urgent", ownerType: "project", ownerId: "proj-1", skill: "assemblage", plannedHours: 8.5, priority: 10 }),
        task({ id: "t-roulement", ownerType: "rolling", ownerId: "roul-1", skill: "assemblage", plannedHours: 8.5, priority: 0 + ROLLING_PRIORITY_BONUS }),
      ],
    });
    expect(result.tasks.find((t) => t.id === "t-projet-urgent")!.predictedCompletedDate).toBe(result.horizonDays[0]);
  });
});

describe("runGanttSchedule — desiredStart bloque une tâche même prioritaire", () => {
  it("une tâche datée dans le futur reste ignorée jusqu'à cette date, même si rien d'autre ne l'occupe", () => {
    const emp = employee("e1", ["installation"]);
    const futureStart = businessDaysFrom(MONDAY, 3)[2]!.toISOString().slice(0, 10);
    const result = runGanttSchedule({
      today: MONDAY,
      employees: [emp],
      interruptions: [],
      tasks: [task({ id: "t1", skill: "installation", plannedHours: 4, priority: 99, desiredStart: futureStart })],
    });
    expect(result.tasks[0]!.firstScheduledDate).toBe(futureStart);
  });
});

describe("runGanttSchedule — dérogation volontaire (employé imposé sans la compétence)", () => {
  it("un employé imposé (pinnedEmployeeId) reste planifiable même à 0 % de compétence déclarée", () => {
    const unqualified = employee("e1", ["installation"]); // n'a pas "soudage"
    const result = runGanttSchedule({
      today: MONDAY,
      employees: [unqualified],
      interruptions: [],
      tasks: [task({ id: "t1", skill: "soudage", plannedHours: 4, pinnedEmployeeId: "e1" })],
    });
    expect(result.unscheduled).toHaveLength(0);
    expect(result.tasks[0]!.allocations[0]!.employeeId).toBe("e1");
  });
});

describe("runGanttSchedule — tâche jamais planifiable dans l'horizon", () => {
  it("aucun employé qualifié : la tâche reste dans unscheduled, jamais masquée", () => {
    const result = runGanttSchedule({
      today: MONDAY,
      employees: [employee("e1", ["installation"])],
      interruptions: [],
      tasks: [task({ id: "t1", skill: "soudage", plannedHours: 4 })],
    });
    expect(result.unscheduled.map((t) => t.id)).toEqual(["t1"]);
    expect(result.tasks[0]!.predictedCompletedDate).toBeNull();
  });
});

describe("rollingGanttTasks — équivalent simplifié d'amendmentTasks pour un Roulement", () => {
  it("une tâche par catégorie fournie, sans dépendances", () => {
    const tasks = rollingGanttTasks("roul-1", { "fabrication-plasma": 10, assemblage: 5 });
    expect(tasks).toHaveLength(2);
    expect(tasks.find((t) => t.category === "fabrication-plasma")).toEqual({ id: "roul-1-fabrication-plasma", category: "fabrication-plasma", hours: 10 });
  });
  it("ignore les catégories à 0h", () => {
    const tasks = rollingGanttTasks("roul-1", { assemblage: 0, programmation: 5 });
    expect(tasks.map((t) => t.category)).toEqual(["programmation"]);
  });
});

describe("GANTT_HORIZON_BUSINESS_DAYS — horizon dynamique confirmé", () => {
  it("30 jours ouvrables par défaut", () => {
    expect(GANTT_HORIZON_BUSINESS_DAYS).toBe(30);
    const result = runGanttSchedule({ today: MONDAY, employees: [], interruptions: [], tasks: [] });
    expect(result.horizonDays).toHaveLength(30);
  });
});
