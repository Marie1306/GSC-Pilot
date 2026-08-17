/**
 * GSC Pilot — Réel vs planifié (heures, par catégorie)
 *
 * NOUVEAU module (pas un port). Regroupe les punchs réels (TimeEntry
 * approuvés) par catégorie de budgétaire — même calcul que
 * internalHoursSummary (internal-stats.ts) : heures = roundedMinutes / 60,
 * coût = heures × costRate gelé au moment du punch — jamais le
 * hourlyRate de la ligne budgétaire, qui ne sert qu'au côté planifié.
 *
 * Portée actuelle (17 août 2026) : regroupement par CATÉGORIE seulement,
 * pas par sous-catégorie/tâche. TimeEntry.taskId (PunchableTask) existe
 * au schéma mais n'est peuplé nulle part dans le code — le punch d'heures
 * lui-même reste à construire (apps/web/.../timePunch est un squelette).
 * Le regroupement par sous-tâche viendra naturellement une fois ce module
 * construit, plutôt que d'être deviné ici à partir de la référence v19.
 */

function round2(value: number): number {
  return Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100;
}

export interface ActualTimeEntryLike {
  category: string;
  status: string;
  roundedMinutes?: number | null;
  costRate?: number;
}

export interface ActualHoursByCategory {
  category: string;
  hours: number;
  cost: number;
}

/** Heures/coût réels d'un projet, groupés par catégorie — punchs approuvés seulement. */
export function actualHoursByCategory(timeEntries: ActualTimeEntryLike[] | undefined): ActualHoursByCategory[] {
  const byCategory = new Map<string, ActualHoursByCategory>();
  for (const entry of timeEntries || []) {
    if (entry.status !== "approved") continue;
    const hours = Number(entry.roundedMinutes || 0) / 60;
    const cost = hours * Number(entry.costRate || 0);
    const current = byCategory.get(entry.category) || { category: entry.category, hours: 0, cost: 0 };
    current.hours += hours;
    current.cost += cost;
    byCategory.set(entry.category, current);
  }
  return [...byCategory.values()].map((row) => ({ ...row, hours: round2(row.hours), cost: round2(row.cost) }));
}
