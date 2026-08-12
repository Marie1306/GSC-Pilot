/**
 * GSC Pilot — Catalogue unique des 13 catégories réelles du budgétaire
 *
 * NOUVEAU module (pas un port). Remplace un premier jet fait pendant la
 * fondation (Phase 1, 8 août 2026) qui ne modélisait que 5 sections
 * (conception/fabrication/programmation/assemblage/installation) — resté
 * mort dans le code (jamais importé nulle part, vérifié avant de le
 * retirer) après la refonte du 12 août 2026, qui a établi les 13 vraies
 * catégories catégorie par catégorie contre le prototype v19. Voir l'audit
 * du 12 août 2026, section H : avant ce catalogue, la même liste était
 * tapée à la main à 4 endroits (apps/api/.../budgets/service.ts,
 * apps/web/.../budgets/api.ts, apps/api/scripts/seed.ts, plus ce fichier
 * lui-même dans sa version périmée) — rien n'empêchait ces listes de
 * diverger silencieusement. Ici, l'enum Prisma (BudgetCategory,
 * apps/api/prisma/schema.prisma) reste la source pour la base de données —
 * ne change pas souvent — mais les libellés, groupes visuels et la liste
 * des catégories « modulables » se dérivent maintenant tous d'ici.
 *
 * Les lignes/taux par catégorie restent des DONNÉES (BudgetModelRow /
 * apps/api/scripts/seed.ts CATEGORY_ROWS), pas dupliquées ici — ce
 * catalogue ne décrit que la structure des catégories elles-mêmes.
 *
 * Le tableau BUDGET_CATEGORIES ci-dessous est volontairement laissé SANS
 * annotation de type explicite : une annotation élargirait "labor"/
 * "purchase" et chaque slug vers `string`, et ferait perdre le typage
 * littéral que donne `as const` — BudgetCategoryDef/BudgetCategorySlug sont
 * dérivés APRÈS coup, par inférence.
 */
import type { SectionKind } from "./sections.js";

export type BudgetGroupKey = "labor" | "purchases" | "installation";

export const BUDGET_GROUP_LABELS: Record<BudgetGroupKey, string> = Object.freeze({
  labor: "Main-d'œuvre",
  purchases: "Achats prévus",
  installation: "Installation / Service",
});

/**
 * Ordre d'affichage — 3 groupes visuels contigus (Main-d'œuvre, Achats
 * prévus, Installation / Service), confirmé le 12 août 2026 dans la revue
 * catégorie par catégorie de la v19. Corrigé le 12 août 2026 (deuxième
 * passage) : une version antérieure plaçait "installationLabor" juste après
 * "assemblyTest", séparée de "installationStock"/"installationExpenses" par
 * tout le groupe Achats prévus — deux en-têtes "Installation / Service"
 * affichés au lieu d'un seul, puisque l'affichage insère un en-tête chaque
 * fois que le groupe change en parcourant CET ORDRE (voir buildSectionList,
 * apps/web/.../BudgetDetail.tsx) — l'ordre du tableau doit donc lui-même
 * garder chaque groupe contigu, pas seulement porter le bon `group`.
 */
export const BUDGET_CATEGORIES = Object.freeze([
  { slug: "conception", label: "Conception", kind: "labor", group: "labor", modular: false },
  { slug: "fabrication", label: "Fabrication", kind: "labor", group: "labor", modular: false },
  { slug: "panelProgramming", label: "Panneau & Programmation", kind: "labor", group: "labor", modular: false },
  { slug: "assemblyTest", label: "Assemblage & Test", kind: "labor", group: "labor", modular: false },
  { slug: "stockFabrication", label: "Stock Fabrication / Châssis", kind: "purchase", group: "purchases", modular: true },
  { slug: "stockPanel", label: "Stock Panneau / Programmation", kind: "purchase", group: "purchases", modular: true },
  { slug: "motorization", label: "Motorisation / Automatisation", kind: "purchase", group: "purchases", modular: true },
  { slug: "hardware", label: "Quincaillerie / Autre", kind: "purchase", group: "purchases", modular: true },
  { slug: "consumables", label: "Consommables", kind: "purchase", group: "purchases", modular: false },
  { slug: "subcontracting", label: "Sous-traitance", kind: "purchase", group: "purchases", modular: true },
  { slug: "installationLabor", label: "Installation/Service — Main-d'œuvre", kind: "labor", group: "installation", modular: false },
  { slug: "installationStock", label: "Installation — Stock", kind: "purchase", group: "installation", modular: true },
  { slug: "installationExpenses", label: "Installation — Frais divers", kind: "purchase", group: "installation", modular: false },
] as const);

export type BudgetCategoryDef = (typeof BUDGET_CATEGORIES)[number];
export type BudgetCategorySlug = BudgetCategoryDef["slug"];

export const BUDGET_CATEGORY_SLUGS: readonly BudgetCategorySlug[] = Object.freeze(BUDGET_CATEGORIES.map((c) => c.slug));

export const MODULAR_BUDGET_CATEGORIES: readonly BudgetCategorySlug[] = Object.freeze(
  BUDGET_CATEGORIES.filter((c) => c.modular).map((c) => c.slug),
);

export const BUDGET_CATEGORY_LABELS: Record<BudgetCategorySlug, string> = Object.freeze(
  Object.fromEntries(BUDGET_CATEGORIES.map((c) => [c.slug, c.label])) as Record<BudgetCategorySlug, string>,
);

export const BUDGET_CATEGORY_KIND: Record<BudgetCategorySlug, SectionKind> = Object.freeze(
  Object.fromEntries(BUDGET_CATEGORIES.map((c) => [c.slug, c.kind])) as Record<BudgetCategorySlug, SectionKind>,
);

export const BUDGET_CATEGORY_GROUP: Record<BudgetCategorySlug, BudgetGroupKey> = Object.freeze(
  Object.fromEntries(BUDGET_CATEGORIES.map((c) => [c.slug, c.group])) as Record<BudgetCategorySlug, BudgetGroupKey>,
);

/**
 * backup.ts (jamais modifié, un des modules portés) attend les identifiants
 * figés "fabrication"/"programmation"/"assemblage" — seules ces 3
 * catégories entrent dans le calcul du back-up d'heures (confirmé,
 * Conception et Installation en sont exclues). Traduit nos vrais slugs vers
 * ce vocabulaire plutôt que de le deviner à chaque appelant.
 */
export const BACKUP_ELIGIBLE_ALIAS: Partial<Record<BudgetCategorySlug, string>> = Object.freeze({
  fabrication: "fabrication",
  panelProgramming: "programmation",
  assemblyTest: "assemblage",
});

/**
 * Statuts d'une demande d'achat — confirmés par lecture directe du
 * mécanisme actif dans la référence v19 (pas seulement la prose de la
 * spécification) : en attente Direction, puis soit autorisée directement
 * (sous le seuil), soit en attente Propriétaire (au-dessus du seuil) avant
 * d'être autorisée. Rejetée est terminal à n'importe quelle étape (voir
 * roles.ts — canResubmitRejectedPurchase).
 */
export const PURCHASE_REQUEST_STATUSES = Object.freeze([
  "owner_pending",
  "boss_pending",
  "authorized",
  "rejected",
] as const);
export type PurchaseRequestStatus = (typeof PURCHASE_REQUEST_STATUSES)[number];
