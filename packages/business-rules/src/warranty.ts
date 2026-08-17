/**
 * GSC Pilot — Garantie
 *
 * Confirmé le 17 août 2026 (Q&R avec l'utilisatrice, aucune règle devinée) :
 * deux données indépendantes sur un projet — warrantyExpected (informatif,
 * coché dès la création si on sait déjà que ce projet ira en garantie, mais
 * pas encore quand — n'active rien seul) et warrantyEndsAt (le vrai
 * interrupteur : nul = pas en garantie, rempli = en garantie jusqu'à cette
 * date). Activation/modification : Direction seulement (roles.ts,
 * canManageWarranty), n'importe quand — aucun préalable de production/
 * sortie. Un projet peut être fermé (closedAt) ET en garantie active en
 * même temps : deux données indépendantes, jamais une contradiction — ça ne
 * dépend pas du statut du projet.
 *
 * Onglet dérivé, jamais un nouveau statut stocké : Garantie = warrantyEndsAt
 * rempli ET dans le futur; Fermés = closedAt rempli ET pas en garantie;
 * Actifs = closedAt vide ET pas en garantie. Avantage confirmé : la
 * garantie expire toute seule le lendemain, sans job ni geste manuel de
 * "fermeture". Les heures punchées en garantie comptent encore dans la
 * marge réelle du projet (confirmé) — aucun traitement à part, le même
 * TimeEntry/margin.ts existant s'applique tel quel.
 *
 * Note pour une future session : le module punch d'heures n'existe pas
 * encore (aucun fichier sous apps/api/src/modules/time-entries ou punch au
 * 17 août 2026). Quand il se construira, son filtre de projets punchables
 * devra inclure closedAt=null OU en garantie active — pas seulement
 * closedAt=null (confirmé : « il faudrait que le projet soit ailleurs que
 * dans actifs ou fermés » pour continuer à puncher après fermeture). Voir
 * le même correctif déjà appliqué à la liste projets (routes.ts) pour le
 * sélecteur d'achats.
 */

export type ProjectLifecycleTab = "active" | "warranty" | "closed";

export interface WarrantyLike {
  closedAt?: string | Date | null;
  warrantyEndsAt?: string | Date | null;
}

export function isUnderWarranty(warrantyEndsAt: string | Date | null | undefined, now: Date = new Date()): boolean {
  if (!warrantyEndsAt) return false;
  return new Date(warrantyEndsAt).getTime() > now.getTime();
}

export function projectLifecycleTab(project: WarrantyLike, now: Date = new Date()): ProjectLifecycleTab {
  if (isUnderWarranty(project.warrantyEndsAt, now)) return "warranty";
  if (project.closedAt) return "closed";
  return "active";
}
