/**
 * GSC Pilot — Sous-assemblages de conception
 *
 * Conçu ensemble le 9 août 2026, pour répondre à un vrai problème humain,
 * pas un bug : la conception (un seul designer) avance de façon
 * imprévisible, au gré des sous-assemblages — jamais dans un ordre
 * planifiable d'avance, jamais sur un horaire qu'on peut lui imposer.
 *
 * Principe : ne rien prédire. Le designer déclare un sous-assemblage prêt
 * au moment où il l'est vraiment — le numéro (sa propre logique
 * d'ingénierie, ex. « 08 » pour une machine soudeuse) suffit, aucune
 * description requise. Ça atterrit dans le centre d'actions de la
 * Direction, exactement comme les demandes de budgétaire ou de
 * facturation déjà dans la v19. Une fois la liste de pièces créée, le
 * sous-assemblage devient planifiable dans le vrai Gantt de production —
 * pendant que le designer continue sur autre chose, dans n'importe quel
 * ordre. Son propre « mini Gantt » n'est donc pas un plan d'avance : un
 * historique vivant qui se remplit à mesure qu'il déclare.
 *
 * Porté depuis docs/handoff/03-modules-v01/subassembly.js — typage ajouté
 * uniquement, aucune ligne de logique changée (voir CLAUDE.md).
 */

export type SubassemblyStatus = "pending_parts_list" | "ready_for_production";

export interface Subassembly {
  id: string;
  projectId: string;
  number: string;
  declaredBy: string;
  declaredAt: string;
  status: SubassemblyStatus;
  partsListPreparedBy?: string;
  partsListPreparedAt?: string;
  hoursByCategory?: Record<string, number>;
  assemblyReadyDeclaredBy?: string;
  assemblyReadyDeclaredAt?: string;
}

export interface GanttTask {
  id: string;
  subassemblyId: string;
  category: string;
  hours: number;
  dependencies: string[];
  releasedBy?: string;
  releasedAt?: string;
}

/** Le designer déclare un sous-assemblage prêt. Un seul geste, un seul champ. */
export function declareSubassemblyReady(
  subassemblies: Subassembly[],
  { projectId, number, declaredBy }: { projectId: string; number: string; declaredBy: string },
): Subassembly {
  if (!projectId || !number || !declaredBy) {
    throw new Error("projectId, number et declaredBy sont requis.");
  }
  const id = `${projectId}-${number}`;
  if (subassemblies.some((item) => item.id === id)) {
    throw new Error(`Assemblage ${id} déjà déclaré.`);
  }
  const entry: Subassembly = {
    id,
    projectId,
    number,
    declaredBy,
    declaredAt: new Date().toISOString(),
    status: "pending_parts_list", // en attente que la Direction crée la liste des pièces
  };
  subassemblies.push(entry);
  return entry;
}

/**
 * La Direction crée la liste des pièces — le sous-assemblage devient
 * planifiable dans le Gantt de production à partir de ce moment.
 *
 * Confirmé le 9 août 2026 : les heures ne se devinent pas en % d'avance —
 * la Direction estime les heures réelles pour CE sous-assemblage précis,
 * au moment où elle voit vraiment ce qu'il contient (pas un pourcentage
 * du budget global du projet, qui lui reste la référence cumulative).
 * Catégories variables selon le sous-assemblage (ex. certains n'ont pas
 * de programmation) — hoursByCategory ne contient que celles qui
 * s'appliquent.
 */
export function markPartsListReady(
  subassembly: Subassembly,
  preparedBy: string,
  hoursByCategory: Record<string, number>,
): Subassembly {
  if (subassembly.status !== "pending_parts_list") {
    throw new Error(
      `Assemblage ${subassembly.id} n'est pas en attente de liste de pièces (statut actuel : ${subassembly.status}).`,
    );
  }
  if (!hoursByCategory || Object.keys(hoursByCategory).length === 0) {
    throw new Error("Au moins une catégorie d'heures est requise.");
  }
  subassembly.status = "ready_for_production";
  subassembly.partsListPreparedBy = preparedBy;
  subassembly.partsListPreparedAt = new Date().toISOString();
  subassembly.hoursByCategory = hoursByCategory;
  return subassembly;
}

/**
 * Direction déclare que l'assemblage peut commencer — un geste direct,
 * comme celui de Marc pour la conception. Confirmé le 9 août 2026 :
 * l'assemblage dépend de pièces spécifiques, pas d'une proportion ou
 * d'un compte de sous-catégories de fabrication complétées — impossible
 * à calculer, alors on ne le calcule pas. Direction juge quand c'est
 * prêt et le déclare; jusque-là, la tâche d'assemblage n'existe même pas
 * dans le Gantt de production.
 */
export function declareAssemblyReady(subassembly: Subassembly, declaredBy: string): Subassembly {
  if (subassembly.status !== "ready_for_production") {
    throw new Error(`Assemblage ${subassembly.id} n'a pas encore de liste de pièces.`);
  }
  if (!("assemblage" in (subassembly.hoursByCategory || {}))) {
    throw new Error(`Assemblage ${subassembly.id} n'a pas d'heures d'assemblage déclarées.`);
  }
  subassembly.assemblyReadyDeclaredBy = declaredBy;
  subassembly.assemblyReadyDeclaredAt = new Date().toISOString();
  return subassembly;
}

/**
 * Construit les tâches Gantt d'un sous-assemblage prêt.
 *
 * Confirmé le 9 août 2026, précisé le même jour : la fabrication n'est
 * pas une seule catégorie — elle se divise en sous-catégories (ex.
 * fabrication-plasma, fabrication-pliage, fabrication-usinage,
 * fabrication-soudage), reconnues par le préfixe "fabrication". Chacune
 * devient plannifiable immédiatement, comme toute catégorie qui n'est
 * pas programmation ni assemblage.
 *
 * La Programmation, quand elle s'applique, se divise en deux moitiés
 * égales : la première débloquée en même temps que la fabrication (dès
 * la liste de pièces prête), la seconde seulement une fois **toutes**
 * les sous-catégories de fabrication de ce sous-assemblage marquées
 * complétées — jamais une seule sous-catégorie en particulier.
 *
 * L'Assemblage n'apparaît dans les tâches retournées qu'une fois
 * `declareAssemblyReady` appelé par Direction — voir cette fonction.
 * Avant ça, ses heures existent déjà (données à la création de la liste
 * de pièces) mais aucune tâche n'est générée.
 */
export function subassemblyGanttTasks(subassembly: Subassembly): GanttTask[] {
  if (subassembly.status !== "ready_for_production") {
    throw new Error(`Assemblage ${subassembly.id} n'est pas prêt pour la production.`);
  }
  const isFabrication = (category: string) => category === "fabrication" || category.startsWith("fabrication-");
  const hoursByCategory = subassembly.hoursByCategory || {};
  const fabricationIds = Object.keys(hoursByCategory)
    .filter(isFabrication)
    .map((category) => `${subassembly.id}-${category}`);

  const tasks: GanttTask[] = [];
  Object.entries(hoursByCategory).forEach(([category, hours]) => {
    if (category === "programmation") {
      const half = Math.round((Number(hours) / 2) * 100) / 100;
      tasks.push({
        id: `${subassembly.id}-programmation-1`,
        subassemblyId: subassembly.id,
        category: "programmation",
        hours: half,
        dependencies: [], // débloquée dès la liste de pièces prête, comme la fabrication
      });
      tasks.push({
        id: `${subassembly.id}-programmation-2`,
        subassemblyId: subassembly.id,
        category: "programmation",
        hours: Number(hours) - half, // le reste, pour ne jamais perdre de fraction en arrondissant
        dependencies: [...fabricationIds], // attend TOUTES les sous-catégories de fabrication de ce sous-assemblage
      });
    } else if (category === "assemblage") {
      if (!subassembly.assemblyReadyDeclaredBy) return; // pas encore débloquée par Direction — aucune tâche générée
      tasks.push({
        id: `${subassembly.id}-assemblage`,
        subassemblyId: subassembly.id,
        category: "assemblage",
        hours: Number(hours),
        dependencies: [], // débloquée par geste direct, pas par un calcul de sous-catégories
        releasedBy: subassembly.assemblyReadyDeclaredBy,
        releasedAt: subassembly.assemblyReadyDeclaredAt,
      });
    } else {
      tasks.push({
        id: `${subassembly.id}-${category}`,
        subassemblyId: subassembly.id,
        category,
        hours: Number(hours),
        dependencies: [], // plus rien ne bloque une fois la liste de pièces prête — inclut chaque sous-catégorie de fabrication
      });
    }
  });
  return tasks;
}

/** Le mini Gantt du designer : tout ce qu'il a déclaré, dans l'ordre où il l'a fait — jamais un plan d'avance. */
export function designerHistory(subassemblies: Subassembly[], declaredBy: string): Subassembly[] {
  return subassemblies
    .filter((item) => item.declaredBy === declaredBy)
    .slice()
    .sort((a, b) => a.declaredAt.localeCompare(b.declaredAt));
}
