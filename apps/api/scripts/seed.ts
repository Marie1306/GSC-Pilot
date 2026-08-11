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
import { ROLES, type Persona } from "@gsc-pilot/business-rules";

const TEST_PASSWORD = "gsc-pilot-test-2026";

const TEST_EMPLOYEES: { persona: Persona; name: string; initials: string; email: string; costRate: number }[] = [
  { persona: ROLES.OWNER, name: "Test Direction", initials: "TD", email: "test-direction@gscpilot.local", costRate: 45 },
  { persona: ROLES.ADMIN, name: "Test Administration", initials: "TA", email: "test-administration@gscpilot.local", costRate: 32 },
  { persona: ROLES.BOSS, name: "Test Propriétaire", initials: "TP", email: "test-proprietaire@gscpilot.local", costRate: 0 },
  { persona: ROLES.MEMBER, name: "Test Employé", initials: "TE", email: "test-employe@gscpilot.local", costRate: 28 },
  { persona: ROLES.WAREHOUSE, name: "Test Magasinier", initials: "TM", email: "test-magasinier@gscpilot.local", costRate: 26 },
];

type BudgetCategorySlug = "conception" | "fabrication" | "programmation" | "assemblage" | "installation";

// Taux internes par catégorie — mêmes valeurs que packages/business-rules/src/amendments.ts (AMENDMENT_INTERNAL_RATES).
const SECTION_RATES: Record<BudgetCategorySlug, number> = {
  conception: 117,
  fabrication: 112,
  programmation: 117,
  assemblage: 112,
  installation: 112,
};

const FABRICATION_SUBROWS = [
  { slug: "fabrication-plasma", label: "Plasma" },
  { slug: "fabrication-pliage", label: "Pliage" },
  { slug: "fabrication-usinage", label: "Usinage" },
  { slug: "fabrication-soudage", label: "Soudage" },
  { slug: "fabrication-peinture", label: "Peinture" },
];

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

const SALES_CHANNELS = ["Référence client", "Site web", "Appel entrant", "Salon professionnel", "Réseaux sociaux"];

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

  const categories = ["conception", "fabrication", "programmation", "assemblage", "installation"] as const;
  for (const [sortOrder, category] of categories.entries()) {
    const section = await prisma.budgetModelSection.upsert({
      where: { budgetModelId_category: { budgetModelId: model.id, category } },
      update: {},
      create: { budgetModelId: model.id, category, sortOrder },
    });

    if (category === "fabrication") {
      for (const [rowOrder, row] of FABRICATION_SUBROWS.entries()) {
        await prisma.budgetModelRow.upsert({
          where: { sectionId_slug: { sectionId: section.id, slug: row.slug } },
          update: {},
          create: { sectionId: section.id, slug: row.slug, label: row.label, hourlyRate: SECTION_RATES.fabrication, sortOrder: rowOrder },
        });
      }
    } else {
      await prisma.budgetModelRow.upsert({
        where: { sectionId_slug: { sectionId: section.id, slug: category } },
        update: {},
        create: { sectionId: section.id, slug: category, label: category, hourlyRate: SECTION_RATES[category], sortOrder: 0 },
      });
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
