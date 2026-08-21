/**
 * GSC Pilot — Catégories de production (Gantt / sous-assemblages / avenants)
 *
 * NOUVEAU module (pas un port). Vocabulaire distinct des 13 catégories du
 * budgétaire (voir categories.ts) : celui-ci correspond aux clés utilisées
 * par subassembly.ts/amendments.ts — "conception", "fabrication" (+
 * sous-catégories "fabrication-*" en texte libre, ex. "fabrication-plasma"),
 * "programmation", "assemblage", "installation". Labels seulement, aucune
 * règle de calcul ici.
 */

const KNOWN_LABELS: Record<string, string> = {
  conception: "Conception",
  fabrication: "Fabrication",
  programmation: "Programmation",
  assemblage: "Assemblage",
  installation: "Installation",
};

function titleCase(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

/** "fabrication-plasma" -> "Fabrication — Plasma" ; "programmation" -> "Programmation". */
export function productionCategoryLabel(category: string): string {
  if (KNOWN_LABELS[category]) return KNOWN_LABELS[category];
  if (category.startsWith("fabrication-")) {
    return `Fabrication — ${titleCase(category.slice("fabrication-".length))}`;
  }
  return titleCase(category);
}
