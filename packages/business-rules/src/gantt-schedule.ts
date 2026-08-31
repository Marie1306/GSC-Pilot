/**
 * GSC Pilot — Moteur de planification automatique du Gantt de production (31 août 2026)
 *
 * NOUVEAU module (pas un port) — le Gantt de production était volontairement
 * resté un simple tableau à dépendances sans dates ni capacité depuis la
 * construction initiale (21 août 2026), en attendant cette phase séparée
 * (voir gantt/service.ts, ancien en-tête). L'algorithme ci-dessous n'est pas
 * deviné : il reprend la forme du moteur déjà conçu et validé dans la
 * référence v19 (jamais construit dans GSC Pilot) — en particulier le cas du
 * goulot d'étranglement à un seul employé qualifié (Yannick, seul
 * programmeur), déjà vérifié correct le 9 août 2026 : « chaque jour, les
 * tâches admissibles sont triées par priorité puis échéance, et la capacité
 * de l'employé se consomme dans cet ordre. »
 *
 * Explicitement HORS scope ici (mini Gantt de conception, jamais touché) :
 * les Assemblages de Marc (subassembly.ts, jamais prédits, geste par geste).
 * Ce module ne planifie QUE les tâches déjà générées par ce mini Gantt
 * (subassembly.ts) ou les Avenants (amendments.ts) — jamais leur création.
 *
 * Principe central, jamais changé : une date ici est toujours PRÉDITE (sert
 * à enchaîner les tâches dépendantes et à afficher les barres du Gantt),
 * jamais la complétion RÉELLE — qui reste `ProjectTask.ganttCompleted`, un
 * geste 100 % manuel de Direction, jamais un effet de bord d'un calcul.
 *
 * Le calendrier est toujours recalculé au complet à la lecture (jamais une
 * date stockée) — cohérent avec le reste de l'application (progressionPct,
 * statut financier, totaux du budgétaire : toujours recalculés, jamais mis
 * en cache) et largement assez rapide à l'échelle réelle (horizon de 30
 * jours ouvrables × quelques centaines de tâches × une vingtaine
 * d'employés).
 */

export const QUEBEC_WEEKDAY_HOURS = Object.freeze({ MON_THU: 8.5, FRI: 4 } as const);

/** Horizon dynamique confirmé — toujours 30 jours OUVRABLES à partir
 * d'aujourd'hui (pas une plage calendaire fixe), comme le moteur v19. */
export const GANTT_HORIZON_BUSINESS_DAYS = 30;

/**
 * Bonus structurel de priorité pour les tâches issues d'un Roulement —
 * repris tel quel du moteur v19 déjà validé, jamais un chiffre deviné.
 * "Presque toujours" avant un Projet (confirmé par l'utilisatrice), jamais
 * une règle absolue : un Projet à priorité manuelle assez élevée peut
 * encore passer devant. La raison, donnée par l'utilisatrice : un Roulement
 * n'est activé (voir Rolling.enteredGanttAt) qu'une fois son stock
 * physiquement arrivé — il est donc réellement prêt à démarrer MAINTENANT,
 * alors qu'un Projet peut être entré plus tôt et tolérer un déplacement de
 * calendrier.
 */
export const ROLLING_PRIORITY_BONUS = 2;

/**
 * Motifs d'interruption — les 7 confirmés par l'utilisatrice (mécanisme
 * déjà prévu, jamais construit) plus "jour_ferie" (aucun motif dédié dans
 * la liste confirmée pour un jour férié — ajouté plutôt que de le glisser
 * sous "autre", à reconfirmer si l'utilisatrice préfère l'inverse).
 */
export const INTERRUPTION_REASONS = Object.freeze([
  "absence",
  "vacances",
  "service_urgent",
  "livraison",
  "formation",
  "maintenance_interne",
  "jour_ferie",
  "autre",
] as const);
export type InterruptionReason = (typeof INTERRUPTION_REASONS)[number];

export interface GanttEmployee {
  id: string;
  /** Uniquement les employés déjà actifs — filtré par l'appelant (adaptateur), jamais ici. */
  skills: string[];
  /** {[skill]: pourcentage 0-200, voir packages/shared/src/schemas/employee.ts} — Gantt seulement. */
  skillEfficiencies: Record<string, number>;
}

export interface GanttInterruption {
  /** Nul = tout l'atelier (ex. jour férié), sinon un employé précis. */
  employeeId: string | null;
  /** Format YYYY-MM-DD. */
  date: string;
  hours: number;
}

export type GanttOwnerType = "project" | "rolling";

export interface GanttTaskInput {
  id: string;
  ownerType: GanttOwnerType;
  ownerId: string;
  /** Nul en théorie seulement — une tâche générée (Assemblage/Avenant/Roulement) a toujours sa catégorie comme compétence. Sans compétence, personne ne se qualifie automatiquement (voir employeeSkillEfficiency) — seule une dérogation manuelle (pinnedEmployeeId) peut la planifier. */
  skill: string | null;
  plannedHours: number;
  /** Format YYYY-MM-DD — porte d'éligibilité (la tâche n'est jamais considérée avant cette date), pas seulement un tri. */
  desiredStart: string | null;
  dependsOnIds: string[];
  /** Dérogation volontaire (ProjectTask.assignedEmployeeId) — force cet employé précis, même sans la compétence déclarée, sans vérification (spec confirmée, comme avant le moteur automatique). Nul = le moteur choisit lui-même. */
  pinnedEmployeeId: string | null;
  /** Déjà résolu par l'appelant : Project.priority, ou Rolling.priority + ROLLING_PRIORITY_BONUS. */
  priority: number;
  /** Format YYYY-MM-DD — Project.deadline ou Rolling.dueDate, départage après la priorité. */
  deadline: string | null;
}

export interface GanttAllocation {
  date: string;
  employeeId: string;
  rawHours: number;
  effectiveHours: number;
}

export interface GanttScheduledTask extends GanttTaskInput {
  allocations: GanttAllocation[];
  firstScheduledDate: string | null;
  /** PRÉDITE seulement — ne touche jamais ProjectTask.ganttCompleted, voir en-tête du fichier. */
  predictedCompletedDate: string | null;
  remainingHours: number;
}

export interface GanttCapacityInfo {
  base: number;
  available: number;
}

export interface GanttScheduleResult {
  horizonDays: string[];
  tasks: GanttScheduledTask[];
  /** Tâches dont l'horizon s'est épuisé sans qualifier assez d'employé disponible — à risque, jamais masquées. */
  unscheduled: GanttScheduledTask[];
  capacityByEmployeeDate: Record<string, Record<string, GanttCapacityInfo>>;
}

/** Exportée pour que l'adaptateur Prisma (gantt/service.ts) formate ses dates exactement comme le moteur — jamais toISOString() (UTC), qui peut décaler d'un jour selon le fuseau. */
export function toDateKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/** Toujours midi, jamais minuit — évite les décalages d'heure d'été/fuseau lors des comparaisons de dates (même précaution que le moteur v19). */
function atNoon(value: string | Date): Date {
  if (typeof value === "string") return new Date(`${value}T12:00:00`);
  return new Date(value.getFullYear(), value.getMonth(), value.getDate(), 12, 0, 0);
}

/** count jours OUVRABLES (lun-ven) à partir de start, inclusivement. */
export function businessDaysFrom(start: Date, count: number): Date[] {
  const days: Date[] = [];
  const cursor = atNoon(start);
  while (days.length < count) {
    const dayOfWeek = cursor.getDay();
    if (dayOfWeek !== 0 && dayOfWeek !== 6) days.push(new Date(cursor));
    cursor.setDate(cursor.getDate() + 1);
  }
  return days;
}

/** Semaine québécoise confirmée : lun-jeu 8,5h, ven 4h, weekend 0 (déjà exclu par businessDaysFrom). */
export function baseDailyCapacityHours(date: Date): number {
  const dayOfWeek = date.getDay();
  if (dayOfWeek >= 1 && dayOfWeek <= 4) return QUEBEC_WEEKDAY_HOURS.MON_THU;
  if (dayOfWeek === 5) return QUEBEC_WEEKDAY_HOURS.FRI;
  return 0;
}

/**
 * Confirmé (9 août 2026, exemple chiffré) : une tâche planifiée à 20h
 * réelles s'étire à 40h de calendrier si l'employé assigné est à 50 %
 * d'efficacité sur cette compétence — jamais l'inverse (l'efficacité
 * n'affecte QUE le Gantt, jamais le budgétaire/heures/post-mortem, voir
 * schema.prisma sur skillEfficiencies).
 *
 * Un pourcentage explicite (skillEfficiencies[skill]) est plafonné à un
 * minimum de 5 % s'il est positif (ne jamais diviser par une valeur
 * infinitésimale) ; sans pourcentage explicite mais la compétence listée,
 * 100 % par défaut ; sans la compétence du tout, 0 (pas qualifié).
 */
export function employeeSkillEfficiency(employee: GanttEmployee, skill: string | null | undefined): number {
  if (!skill) return 0;
  const raw = Number(employee.skillEfficiencies?.[skill]);
  if (Number.isFinite(raw) && raw > 0) return Math.max(0.05, raw / 100);
  return employee.skills.includes(skill) ? 1 : 0;
}

/** Validée contre la vraie capacité de CE jour précis — jamais un maximum arbitraire côté client (ex. 8,5h un vendredi, où la vraie capacité n'est que 4h). */
export function validateInterruptionHours(date: Date, hours: number): void {
  if (!(hours > 0)) throw new Error("Le nombre d'heures d'interruption doit être positif.");
  const base = baseDailyCapacityHours(date);
  if (hours > base) {
    throw new Error(`Le nombre d'heures (${hours}) dépasse la capacité de base de cette journée (${base} h).`);
  }
}

function compareDeadlines(a: string | null, b: string | null): number {
  if (a === b) return 0;
  if (!a) return 1; // pas d'échéance = moins urgent, passe après
  if (!b) return -1;
  return atNoon(a).getTime() - atNoon(b).getTime();
}

/**
 * Le cœur du moteur — jour par jour (dans l'horizon), les tâches admissibles
 * (dépendances déjà prédites complétées STRICTEMENT avant ce jour — jamais
 * d'enchaînement le jour même, même règle que v19) sont triées par priorité
 * DESC puis échéance ASC, et consomment la capacité disponible des employés
 * qualifiés dans cet ordre — exactement le mécanisme déjà vérifié pour le
 * goulot d'étranglement à un seul employé (voir en-tête du fichier).
 *
 * Une seule tâche = un seul employé à la fois (pas de travail parallèle à
 * plusieurs personnes ici — ProjectTask.minPeople/maxPeople existent dans
 * le schéma mais restent hors scope de cette phase, aucune exigence
 * confirmée ne le demande encore ; à construire séparément si besoin).
 */
export function runGanttSchedule(input: {
  tasks: GanttTaskInput[];
  employees: GanttEmployee[];
  interruptions: GanttInterruption[];
  today?: Date;
  horizonBusinessDays?: number;
}): GanttScheduleResult {
  const today = input.today ?? new Date();
  const days = businessDaysFrom(today, input.horizonBusinessDays ?? GANTT_HORIZON_BUSINESS_DAYS);
  const horizonDays = days.map(toDateKey);

  const interruptionHoursByKey = new Map<string, number>();
  for (const interruption of input.interruptions) {
    const key = `${interruption.employeeId ?? "*"}|${interruption.date}`;
    interruptionHoursByKey.set(key, (interruptionHoursByKey.get(key) ?? 0) + interruption.hours);
  }

  const available: Record<string, Record<string, number>> = {};
  const capacityByEmployeeDate: GanttScheduleResult["capacityByEmployeeDate"] = {};
  for (const day of days) {
    const dateKey = toDateKey(day);
    const base = baseDailyCapacityHours(day);
    available[dateKey] = {};
    capacityByEmployeeDate[dateKey] = {};
    for (const employee of input.employees) {
      const employeeInterruption = interruptionHoursByKey.get(`${employee.id}|${dateKey}`) ?? 0;
      const shopInterruption = interruptionHoursByKey.get(`*|${dateKey}`) ?? 0;
      const capacity = Math.max(0, base - employeeInterruption - shopInterruption);
      available[dateKey][employee.id] = capacity;
      capacityByEmployeeDate[dateKey][employee.id] = { base, available: capacity };
    }
  }

  const tasks: GanttScheduledTask[] = input.tasks.map((task) => ({
    ...task,
    allocations: [],
    firstScheduledDate: null,
    predictedCompletedDate: null,
    remainingHours: task.plannedHours,
  }));
  const taskById = new Map(tasks.map((task) => [task.id, task]));

  function availableFor(dateKey: string, employeeId: string): number {
    return available[dateKey]?.[employeeId] ?? 0;
  }
  function spendAvailable(dateKey: string, employeeId: string, hours: number): void {
    const dayRecord = available[dateKey];
    if (dayRecord) dayRecord[employeeId] = (dayRecord[employeeId] ?? 0) - hours;
  }

  for (const day of days) {
    const dateKey = toDateKey(day);
    const eligible = tasks
      .filter((task) => task.remainingHours > 0.001)
      .filter((task) => !task.desiredStart || atNoon(task.desiredStart) <= day)
      .filter((task) =>
        task.dependsOnIds.every((depId) => {
          const dependency = taskById.get(depId);
          if (!dependency) return true; // référence hors de ce calcul (ne devrait pas arriver en pratique) — ne bloque jamais silencieusement
          return !!dependency.predictedCompletedDate && atNoon(dependency.predictedCompletedDate) < day;
        }),
      )
      .sort((a, b) => (b.priority !== a.priority ? b.priority - a.priority : compareDeadlines(a.deadline, b.deadline)));

    for (const task of eligible) {
      if (task.remainingHours <= 0.001) continue;

      const candidates = task.pinnedEmployeeId
        ? input.employees.filter((employee) => employee.id === task.pinnedEmployeeId && availableFor(dateKey, employee.id) > 0)
        : input.employees.filter(
            (employee) => availableFor(dateKey, employee.id) > 0 && employeeSkillEfficiency(employee, task.skill) > 0,
          );
      candidates.sort((a, b) => {
        const scoreA = availableFor(dateKey, a.id) * (task.pinnedEmployeeId ? 1 : employeeSkillEfficiency(a, task.skill));
        const scoreB = availableFor(dateKey, b.id) * (task.pinnedEmployeeId ? 1 : employeeSkillEfficiency(b, task.skill));
        return scoreB - scoreA;
      });
      const employee = candidates[0];
      if (!employee) continue;

      // Dérogation volontaire : une compétence absente ne bloque pas un employé imposé (spec confirmée) — traité comme 100 % plutôt que 0 (sinon aucune heure ne serait jamais consommée).
      const skillFactor = task.pinnedEmployeeId ? employeeSkillEfficiency(employee, task.skill) || 1 : employeeSkillEfficiency(employee, task.skill);
      const rawAvailable = availableFor(dateKey, employee.id);
      const rawNeeded = task.remainingHours / skillFactor;
      const rawHours = Math.min(rawAvailable, rawNeeded);
      const effectiveHours = rawHours * skillFactor;

      spendAvailable(dateKey, employee.id, rawHours);
      task.remainingHours = Math.max(0, task.remainingHours - effectiveHours);
      task.allocations.push({ date: dateKey, employeeId: employee.id, rawHours, effectiveHours });
      task.firstScheduledDate ??= dateKey;
      if (task.remainingHours <= 0.001) task.predictedCompletedDate = dateKey;
    }
  }

  return {
    horizonDays,
    tasks,
    unscheduled: tasks.filter((task) => task.remainingHours > 0.001),
    capacityByEmployeeDate,
  };
}

export interface RollingGanttTask {
  id: string;
  category: string;
  hours: number;
}

/**
 * Équivalent simplifié d'amendmentTasks (amendments.ts) pour un Roulement —
 * une tâche par catégorie fournie, sans dépendances (pas d'Assemblage de
 * Marc en amont pour un Roulement) et sans aucun calcul $ : le Roulement a
 * déjà ses propres chiffres (rollings/service.ts), le Gantt n'a besoin que
 * des heures et de la compétence (= la catégorie elle-même). Catégories à
 * 0h ignorées.
 */
export function rollingGanttTasks(rollingId: string, hoursByCategory: Record<string, number>): RollingGanttTask[] {
  return Object.entries(hoursByCategory)
    .filter(([, hours]) => Number(hours) > 0)
    .map(([category, hours]) => ({ id: `${rollingId}-${category}`, category, hours: Number(hours) }));
}
