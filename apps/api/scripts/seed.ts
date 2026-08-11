/**
 * Données de départ pour le développement — jamais de vrais noms, courriels
 * ou taux d'employés réels (voir CLAUDE.md). Sûr à committer, sûr à
 * relancer plusieurs fois (upsert partout).
 *
 * Crée aussi un vrai compte Supabase Auth pour chaque persona de test, avec
 * un mot de passe partagé et connu, pour pouvoir se connecter pour de vrai
 * et vérifier la navigation verrouillée par rôle (critère d'acceptation
 * Phase 1).
 */
import { prisma } from "../src/db.js";
import { supabaseAdmin } from "../src/auth/supabase.js";
import { ROLES, BUDGET_CATEGORY_KIND, type Persona, type BudgetCategorySlug, type SectionKind } from "@gsc-pilot/business-rules";

const TEST_PASSWORD = "gsc-pilot-test-2026";

const TEST_EMPLOYEES: { persona: Persona; name: string; initials: string; email: string; costRate: number }[] = [
  { persona: ROLES.OWNER, name: "Test Direction", initials: "TD", email: "test-direction@gscpilot.local", costRate: 45 },
  { persona: ROLES.ADMIN, name: "Test Administration", initials: "TA", email: "test-administration@gscpilot.local", costRate: 32 },
  { persona: ROLES.BOSS, name: "Test Propriétaire", initials: "TP", email: "test-proprietaire@gscpilot.local", costRate: 0 },
  { persona: ROLES.MEMBER, name: "Test Employé", initials: "TE", email: "test-employe@gscpilot.local", costRate: 28 },
  { persona: ROLES.WAREHOUSE, name: "Test Magasinier", initials: "TM", email: "test-magasinier@gscpilot.local", costRate: 26 },
];

// Catégorie/type dérivés du catalogue unique (@gsc-pilot/business-rules) —
// voir l'audit du 12 août 2026, section H. Seules les lignes/taux ci-dessous
// (CATEGORY_ROWS) restent propres à ce seed, puisqu'elles sont de vraies
// données, pas de la structure.
const CATEGORY_KIND: Record<BudgetCategorySlug, SectionKind> = BUDGET_CATEGORY_KIND;

interface RowSeed {
  slug: string;
  label: string;
  hourlyRate?: number;
  unitPrice?: number;
  /** Modifiable Direction seulement (défaut : labor=true, purchase=false) — Installation/Frais divers mélange les deux, voir ci-dessous. */
  directionOnly?: boolean;
  /** Heures dérivées automatiquement d'une autre ligne de la même section (ex. « Conception plus 10 % »), non saisies directement. */
  autoFromSlug?: string;
  autoPct?: number;
}

function blankPurchaseRows(count: number): RowSeed[] {
  return Array.from({ length: count }, (_, i) => ({ slug: `blank-${i + 1}`, label: "", unitPrice: 0, directionOnly: false }));
}

/**
 * Sous-catégories (lignes), taux et permissions réels par catégorie —
 * vérifiés directement dans le prototype v19 (12 août 2026), catégorie par
 * catégorie, à partir de captures d'écran fournies par l'utilisatrice après
 * qu'une première passe se soit avérée incomplète (5 catégories au lieu de
 * 13, un seul type de ligne au lieu de deux). Taux internes de Conception/
 * Assemblage & Test/Installation — Main-d'œuvre : mêmes valeurs que
 * packages/business-rules/src/amendments.ts (AMENDMENT_INTERNAL_RATES) là où
 * elles coïncident; Fabrication et Panneau & Programmation ont des taux
 * différenciés par tâche, vérifiés dans le prototype, pas dans amendments.ts.
 */
const CATEGORY_ROWS: Record<BudgetCategorySlug, RowSeed[]> = {
  conception: [
    { slug: "conception-dessin", label: "Conception & Dessin", hourlyRate: 117 },
    { slug: "conception-plus-10", label: "Conception plus 10 %", hourlyRate: 117, autoFromSlug: "conception-dessin", autoPct: 10 },
    { slug: "preparation", label: "Préparation", hourlyRate: 112 },
    { slug: "gestion-bom", label: "Gestion / BOM", hourlyRate: 112 },
  ],
  fabrication: [
    { slug: "fabrication-plasma", label: "Plasma", hourlyRate: 116 },
    { slug: "fabrication-usinage", label: "Usinage", hourlyRate: 113 },
    { slug: "fabrication-pliage", label: "Pliage", hourlyRate: 113 },
    { slug: "fabrication-soudage", label: "Soudage / Montage", hourlyRate: 110 },
    { slug: "fabrication-peinture", label: "Peinture", hourlyRate: 107 },
  ],
  panelProgramming: [
    { slug: "panel-schemas", label: "Panneau & Schémas", hourlyRate: 110 },
    { slug: "panel-programmation", label: "Programmation", hourlyRate: 117 },
  ],
  assemblyTest: [
    { slug: "assembly-assemblage", label: "Assemblage", hourlyRate: 112 },
    { slug: "assembly-tests", label: "Test & Finition", hourlyRate: 112 },
    { slug: "assembly-emballage", label: "Emballage", hourlyRate: 112 },
    { slug: "assembly-menage", label: "Ménage", hourlyRate: 112 },
  ],
  installationLabor: [
    { slug: "install-preparation", label: "Préparation", hourlyRate: 107 },
    { slug: "install-temps-regulier", label: "Temps homme régulier", hourlyRate: 112 },
    { slug: "install-temps-supplementaire", label: "Temps homme supplémentaire", hourlyRate: 125 },
    { slug: "install-gestion-bom", label: "Gestion / BOM", hourlyRate: 112 },
    { slug: "install-service-apres-vente", label: "Service après-vente", hourlyRate: 112 },
  ],
  stockFabrication: blankPurchaseRows(10),
  stockPanel: blankPurchaseRows(10),
  motorization: blankPurchaseRows(10),
  hardware: blankPurchaseRows(10),
  consumables: [
    { slug: "consumables-plasma", label: "Plasma", unitPrice: 0, directionOnly: false },
    { slug: "consumables-soudage", label: "Soudage", unitPrice: 0, directionOnly: false },
    { slug: "consumables-usinage", label: "Usinage", unitPrice: 0, directionOnly: false },
    { slug: "consumables-peinture", label: "Peinture", unitPrice: 0, directionOnly: false },
    { slug: "consumables-emballage", label: "Emballage", unitPrice: 0, directionOnly: false },
  ],
  subcontracting: blankPurchaseRows(10),
  installationStock: blankPurchaseRows(10),
  installationExpenses: [
    { slug: "expenses-formation", label: "Formation (heures × techniciens)", unitPrice: 112, directionOnly: true },
    { slug: "expenses-hebergement", label: "Hébergement (nuits × techniciens)", unitPrice: 250, directionOnly: true },
    { slug: "expenses-kilometrage", label: "Kilométrage (distance × déplacements)", unitPrice: 0.97, directionOnly: true },
    { slug: "expenses-transport", label: "Temps de transport (heures × technicien)", unitPrice: 112, directionOnly: true },
    { slug: "expenses-dejeuner", label: "Frais repas — Déjeuner", unitPrice: 17.9, directionOnly: true },
    { slug: "expenses-diner", label: "Frais repas — Dîner", unitPrice: 26.9, directionOnly: true },
    { slug: "expenses-souper", label: "Frais repas — Souper", unitPrice: 37.65, directionOnly: true },
    { slug: "expenses-avion", label: "Avion", unitPrice: 0, directionOnly: true },
    { slug: "expenses-location", label: "Location transport / outils / machinerie", unitPrice: 0, directionOnly: false },
    { slug: "expenses-manutention", label: "Frais de manutention", unitPrice: 0, directionOnly: false },
    { slug: "expenses-livraison", label: "Frais de livraison / service", unitPrice: 0, directionOnly: false },
  ],
};

const PURCHASE_CATEGORIES = [
  { name: "Métaux / matières premières", thresholdAmount: 2000 },
  { name: "Électricité", thresholdAmount: 1000 },
  { name: "Boulonnerie", thresholdAmount: 500 },
  { name: "Outillage", thresholdAmount: 1000 },
  { name: "Pneumatique / hydraulique", thresholdAmount: 1000 },
  { name: "Sous-traitance", thresholdAmount: 5000 },
  { name: "Urgence service", thresholdAmount: 500 },
  { name: "Stock / consommables", thresholdAmount: 1000 },
  { name: "Autre", thresholdAmount: 500 },
];

// Valeurs vérifiées directement dans le prototype v19 (formulaire de demande client), pas devinées.
const SALES_CHANNELS = ["Google", "Facebook", "LinkedIn", "Réseautage", "Référence client", "Site Web", "Téléphone / direct", "Autre"];

async function seedTestEmployees() {
  for (const [index, def] of TEST_EMPLOYEES.entries()) {
    const { data: existingUsers } = await supabaseAdmin.auth.admin.listUsers();
    let authUser = existingUsers?.users.find((u) => u.email === def.email);

    if (!authUser) {
      const { data, error } = await supabaseAdmin.auth.admin.createUser({
        email: def.email,
        password: TEST_PASSWORD,
        email_confirm: true,
      });
      if (error || !data.user) {
        throw new Error(`Impossible de créer l'usager Supabase ${def.email} : ${error?.message}`);
      }
      authUser = data.user;
    }

    await prisma.employee.upsert({
      where: { email: def.email },
      update: { authUserId: authUser.id, persona: def.persona, name: def.name, initials: def.initials, costRate: def.costRate },
      create: {
        authUserId: authUser.id,
        email: def.email,
        persona: def.persona,
        name: def.name,
        initials: def.initials,
        costRate: def.costRate,
        active: true,
      },
    });
    console.log(`  [${index + 1}/${TEST_EMPLOYEES.length}] ${def.name} (${def.persona}) — ${def.email}`);
  }
}

async function seedSettings() {
  const existing = await prisma.settings.findFirst();
  const defaultBillingSplit = [
    { label: "Signature du contrat", pct: 25 },
    { label: "Après conception", pct: 25 },
    { label: "Livraison", pct: 40 },
    { label: "30 jours après livraison", pct: 10 },
  ];
  if (existing) {
    await prisma.settings.update({ where: { id: existing.id }, data: { defaultBillingSplit } });
  } else {
    await prisma.settings.create({
      data: {
        mileageRate: 0.68,
        breakfastRate: 15,
        lunchRate: 20,
        dinnerRate: 25,
        defaultBillingSplit,
        projectNumberPrefix: "PRJ",
        nextProjectNumber: 1,
        servicePartsDefaultMarginPct: 20,
        punchRoundingMinutes: 15,
      },
    });
  }
}

async function seedBudgetModel() {
  let model = await prisma.budgetModel.findFirst();
  if (!model) {
    model = await prisma.budgetModel.create({ data: { backupHourlyRate: 112, backupDefaultPct: 10 } });
  }

  const categories = Object.keys(CATEGORY_ROWS) as BudgetCategorySlug[];
  const rowIdBySlug = new Map<string, string>();

  for (const [sortOrder, category] of categories.entries()) {
    const kind = CATEGORY_KIND[category];
    const section = await prisma.budgetModelSection.upsert({
      where: { budgetModelId_category: { budgetModelId: model.id, category } },
      update: { kind },
      create: { budgetModelId: model.id, category, kind, sortOrder },
    });

    for (const [rowOrder, row] of CATEGORY_ROWS[category].entries()) {
      const created = await prisma.budgetModelRow.upsert({
        where: { sectionId_slug: { sectionId: section.id, slug: row.slug } },
        update: {},
        create: {
          sectionId: section.id,
          slug: row.slug,
          label: row.label,
          hourlyRate: row.hourlyRate ?? 0,
          unitPrice: row.unitPrice ?? 0,
          directionOnly: row.directionOnly ?? kind === "labor",
          sortOrder: rowOrder,
        },
      });
      rowIdBySlug.set(`${category}:${row.slug}`, created.id);
    }

    // Retrait = désactivation (jamais une suppression physique, voir schema.prisma).
    await prisma.budgetModelRow.updateMany({
      where: { sectionId: section.id, slug: { notIn: CATEGORY_ROWS[category].map((row) => row.slug) } },
      data: { active: false },
    });
  }

  // Deuxième passe : résout les lignes calculées automatiquement (ex. « Conception
  // plus 10 % ») une fois que toutes les lignes existent et ont un vrai id.
  for (const category of categories) {
    for (const row of CATEGORY_ROWS[category]) {
      if (!row.autoFromSlug) continue;
      const rowId = rowIdBySlug.get(`${category}:${row.slug}`);
      const sourceId = rowIdBySlug.get(`${category}:${row.autoFromSlug}`);
      if (!rowId || !sourceId) continue;
      await prisma.budgetModelRow.update({ where: { id: rowId }, data: { autoFromRowId: sourceId, autoPct: row.autoPct ?? 0 } });
    }
  }
}

async function seedPurchaseCategories() {
  for (const [sortOrder, category] of PURCHASE_CATEGORIES.entries()) {
    await prisma.purchaseCategory.upsert({
      where: { name: category.name },
      update: { thresholdAmount: category.thresholdAmount, sortOrder },
      create: { ...category, sortOrder },
    });
  }
}

async function seedSalesChannels() {
  for (const [sortOrder, name] of SALES_CHANNELS.entries()) {
    await prisma.salesChannel.upsert({ where: { name }, update: { sortOrder }, create: { name, sortOrder } });
  }
}

/** Un contact + un projet fictifs pour pouvoir tester une fonctionnalité de bout en bout (ex. liste rapide d'achats) sans attendre la vraie saisie de projets. */
async function seedTestProject() {
  const direction = await prisma.employee.findUnique({ where: { email: "test-direction@gscpilot.local" } });
  if (!direction) throw new Error("Usager de test 'Test Direction' introuvable — seedTestEmployees doit rouler avant seedTestProject.");

  let contact = await prisma.contact.findFirst({ where: { email: "client-test@gscpilot.local" } });
  if (!contact) {
    contact = await prisma.contact.create({
      data: {
        type: "Client",
        company: "Client Test inc.",
        name: "Alex Client-Test",
        role: "Contact client",
        email: "client-test@gscpilot.local",
        categories: ["Client", "Projet"],
      },
    });
  }

  const existing = await prisma.project.findUnique({ where: { projectNumber: "PRJ-0001" } });
  if (!existing) {
    await prisma.project.create({
      data: {
        projectNumber: "PRJ-0001",
        name: "Projet de test — sécuritaire à effacer",
        contactId: contact.id,
        status: "active",
        createdById: direction.id,
      },
    });
  }
}

async function main() {
  console.log("Usagers de test (Supabase Auth + Employee) :");
  await seedTestEmployees();
  console.log("Paramètres...");
  await seedSettings();
  console.log("Modèle de budgétaire...");
  await seedBudgetModel();
  console.log("Catégories d'achat...");
  await seedPurchaseCategories();
  console.log("Canaux de vente...");
  await seedSalesChannels();
  console.log("Projet de test...");
  await seedTestProject();
  console.log("\nTerminé. Mot de passe des usagers de test :", TEST_PASSWORD);
  console.log("(données de développement seulement — jamais utilisé pour de vrais employés)");
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
