/**
 * GSC Pilot v01 — Statistiques internes (« Amélioration GSC »)
 *
 * Confirmé le 8 août 2026 : suivre le coût annuel du non-facturable, en
 * gardant heures et achats SÉPARÉS (deux totaux, pas un chiffre mélangé),
 * avec la même logique par année pour les deux.
 *
 * Lacune trouvée dans la v19 en la vérifiant : la désignation « Interne
 * GSC » existe déjà pour les achats (même chemin d'approbation que les
 * achats de projet), mais rien n'additionnait ces achats nulle part — le
 * bloc Statistiques Interne ne totalisait que les heures. Ce module ajoute
 * le deuxième totalisateur, sans toucher au premier.
 *
 * Confirmé le 8 août 2026 : les achats internes sont datés par leur
 * `requestedAt` (date de la demande, pas de l'approbation) pour le calcul
 * annuel — même logique que prévu.
 */

function round2(value) {
  return Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100;
}

function yearOf(dateString) {
  const year = Number(String(dateString || "").slice(0, 4));
  return Number.isFinite(year) ? year : null;
}

/**
 * Heures internes approuvées pour une année — reprend la logique déjà
 * confirmée de la v19 (groupé par employé, heures + valeur réelle).
 */
export function internalHoursSummary(timeEntries, year) {
  const entries = (timeEntries || []).filter(
    (entry) => entry.projectType === "internal" && entry.status === "approved" && yearOf(entry.date || entry.approvedAt) === year
  );
  const byEmployee = new Map();
  for (const entry of entries) {
    const hours = Number(entry.roundedMinutes || 0) / 60;
    const value = hours * Number(entry.costRate || 0);
    const current = byEmployee.get(entry.employee) || { employeeId: entry.employee, hours: 0, value: 0, count: 0 };
    current.hours += hours;
    current.value += value;
    current.count += 1;
    byEmployee.set(entry.employee, current);
  }
  const employees = [...byEmployee.values()].map((row) => ({ ...row, hours: round2(row.hours), value: round2(row.value) }));
  return {
    employees,
    hours: round2(employees.reduce((sum, row) => sum + row.hours, 0)),
    value: round2(employees.reduce((sum, row) => sum + row.value, 0)),
  };
}

/**
 * Achats internes autorisés pour une année — même structure par année,
 * mais gardé séparé des heures (deux totaux distincts, jamais additionnés
 * ensemble).
 */
export function internalPurchasesSummary(purchases, year) {
  const entries = (purchases || []).filter(
    (purchase) =>
      purchase.projectType === "internal" &&
      ["approved", "authorized"].includes(purchase.status) &&
      yearOf(purchase.requestedAt) === year
  );
  const byCategory = new Map();
  for (const purchase of entries) {
    const amount = Number(purchase.amount || 0);
    const current = byCategory.get(purchase.category) || { category: purchase.category, amount: 0, count: 0 };
    current.amount += amount;
    current.count += 1;
    byCategory.set(purchase.category, current);
  }
  const categories = [...byCategory.values()].map((row) => ({ ...row, amount: round2(row.amount) }));
  return {
    categories,
    amount: round2(categories.reduce((sum, row) => sum + row.amount, 0)),
    count: entries.length,
  };
}
