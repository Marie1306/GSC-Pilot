// Tests — node subassembly.test.js
import { declareSubassemblyReady, markPartsListReady, subassemblyGanttTasks, declareAssemblyReady, designerHistory } from "./subassembly.js";

let passed = 0, failed = 0;
function check(label, actual, expected) {
  const ok = actual === expected;
  console.log(`${ok ? "PASS" : "FAIL"} — ${label} (attendu ${expected}, obtenu ${actual})`);
  if (ok) passed++; else failed++;
}

console.log("--- Déclaration (exemple réel : projet 2250, assemblage 01-000, format réel) ---");
{
  const subassemblies = [];
  const entry = declareSubassemblyReady(subassemblies, { projectId: "2250", number: "01-000", declaredBy: "Marc" });
  check("Identifiant construit du numéro de projet + assemblage", entry.id, "2250-01-000");
  check("En attente de liste de pièces au départ", entry.status, "pending_parts_list");
  check("Un seul sous-assemblage enregistré", subassemblies.length, 1);
}

console.log("\n--- Pas d'ordre imposé — Marc saute d'un assemblage à l'autre ---");
{
  const subassemblies = [];
  declareSubassemblyReady(subassemblies, { projectId: "2250", number: "04-000", declaredBy: "Marc" });
  declareSubassemblyReady(subassemblies, { projectId: "2250", number: "07-000", declaredBy: "Marc" });
  declareSubassemblyReady(subassemblies, { projectId: "2250", number: "01-000", declaredBy: "Marc" });
  const history = designerHistory(subassemblies, "Marc");
  check("Historique respecte l'ordre réel de déclaration, pas l'ordre numérique", history.map(h => h.number).join(","), "04-000,07-000,01-000");
}

console.log("\n--- Doublon refusé ---");
{
  const subassemblies = [];
  declareSubassemblyReady(subassemblies, { projectId: "2250", number: "01-000", declaredBy: "Marc" });
  let threw = false;
  try { declareSubassemblyReady(subassemblies, { projectId: "2250", number: "01-000", declaredBy: "Marc" }); } catch (e) { threw = true; }
  check("Refuse de déclarer le même sous-assemblage deux fois", threw, true);
}

console.log("\n--- Création de la liste de pièces par la Direction (avec heures réelles du sous-assemblage) ---");
{
  const subassemblies = [];
  const entry = declareSubassemblyReady(subassemblies, { projectId: "2250", number: "02-000", declaredBy: "Marc" });
  markPartsListReady(entry, "owner", { fabrication: 40 });
  check("Devient planifiable pour la production", entry.status, "ready_for_production");
  check("Traçabilité de qui a préparé la liste", entry.partsListPreparedBy, "owner");
}
{
  const subassemblies = [];
  const entry = declareSubassemblyReady(subassemblies, { projectId: "2250", number: "03-000", declaredBy: "Marc" });
  markPartsListReady(entry, "owner", { fabrication: 20 });
  let threw = false;
  try { markPartsListReady(entry, "owner", { fabrication: 20 }); } catch (e) { threw = true; }
  check("Refuse de refaire la liste de pièces d'un sous-assemblage déjà prêt", threw, true);
}
{
  const subassemblies = [];
  const entry = declareSubassemblyReady(subassemblies, { projectId: "2250", number: "05-000", declaredBy: "Marc" });
  let threw = false;
  try { markPartsListReady(entry, "owner", {}); } catch (e) { threw = true; }
  check("Refuse une liste de pièces sans aucune heure", threw, true);
}

console.log("\n--- Tâches Gantt générées — sous-assemblage sans programmation ---");
{
  const subassemblies = [];
  const entry = declareSubassemblyReady(subassemblies, { projectId: "2250", number: "02-000", declaredBy: "Marc" });
  markPartsListReady(entry, "owner", { fabrication: 40 });
  const tasks = subassemblyGanttTasks(entry);
  check("Une seule tâche (fabrication seulement)", tasks.length, 1);
  check("Aucune dépendance — rien ne bloque une fois la liste prête", tasks[0].dependencies.length, 0);
  check("Heures exactes", tasks[0].hours, 40);
}

console.log("\n--- Tâches Gantt générées — avec programmation, fractionnée en deux (exemple discuté) ---");
{
  const subassemblies = [];
  const entry = declareSubassemblyReady(subassemblies, { projectId: "2250", number: "08-000", declaredBy: "Marc" });
  markPartsListReady(entry, "owner", { fabrication: 40, programmation: 10 });
  const tasks = subassemblyGanttTasks(entry);
  check("Trois tâches (fabrication + programmation × 2)", tasks.length, 3);

  const fabrication = tasks.find(t => t.category === "fabrication");
  const prog1 = tasks.find(t => t.id.endsWith("programmation-1"));
  const prog2 = tasks.find(t => t.id.endsWith("programmation-2"));

  check("Fabrication débloquée immédiatement", fabrication.dependencies.length, 0);
  check("Première moitié de programmation débloquée immédiatement, comme la fabrication", prog1.dependencies.length, 0);
  check("Première moitié = 5h (10h ÷ 2)", prog1.hours, 5);
  check("Deuxième moitié attend la fabrication DE CE sous-assemblage précis", prog2.dependencies[0], fabrication.id);
  check("Deuxième moitié = 5h", prog2.hours, 5);
}
{
  // Vérifie qu'aucune heure ne se perd à l'arrondi sur un nombre impair
  const subassemblies = [];
  const entry = declareSubassemblyReady(subassemblies, { projectId: "2250", number: "09-000", declaredBy: "Marc" });
  markPartsListReady(entry, "owner", { fabrication: 15, programmation: 7 });
  const tasks = subassemblyGanttTasks(entry);
  const totalProgrammation = tasks.filter(t => t.category === "programmation").reduce((sum, t) => sum + t.hours, 0);
  check("Aucune heure perdue à l'arrondi (3,5 + 3,5 = 7)", totalProgrammation, 7);
}

console.log("\n--- Sous-catégories de fabrication multiples (précisé le 9 août) ---");
{
  const subassemblies = [];
  const entry = declareSubassemblyReady(subassemblies, { projectId: "2250", number: "11-000", declaredBy: "Marc" });
  markPartsListReady(entry, "owner", {
    "fabrication-plasma": 10, "fabrication-pliage": 8, "fabrication-usinage": 12, "fabrication-soudage": 6,
    programmation: 10, assemblage: 20,
  });
  const tasks = subassemblyGanttTasks(entry);
  const fabTasks = tasks.filter(t => t.category.startsWith("fabrication-"));
  const prog2 = tasks.find(t => t.id.endsWith("programmation-2"));
  const fabIds = fabTasks.map(t => t.id).sort();

  check("4 sous-catégories de fabrication détectées", fabTasks.length, 4);
  check("Chaque sous-catégorie de fabrication débloquée immédiatement", fabTasks.every(t => t.dependencies.length === 0), true);
  check("Programmation (2e moitié) attend les 4 sous-catégories de fabrication, pas une seule", [...prog2.dependencies].sort().join(","), fabIds.join(","));
  check("Assemblage absente tant que Direction ne l'a pas débloquée", tasks.some(t => t.category === "assemblage"), false);
}

console.log("\n--- Assemblage débloquée par geste explicite de Direction (confirmé le 9 août) ---");
{
  const subassemblies = [];
  const entry = declareSubassemblyReady(subassemblies, { projectId: "2250", number: "13-000", declaredBy: "Marc" });
  markPartsListReady(entry, "owner", { "fabrication-usinage": 20, "fabrication-soudage": 15, assemblage: 12 });

  let tasks = subassemblyGanttTasks(entry);
  check("Avant le geste de Direction : pas de tâche d'assemblage du tout", tasks.some(t => t.category === "assemblage"), false);

  declareAssemblyReady(entry, "owner");
  tasks = subassemblyGanttTasks(entry);
  const assemblage = tasks.find(t => t.category === "assemblage");
  check("Après le geste : la tâche apparaît", !!assemblage, true);
  check("Aucune dépendance calculée — débloquée par le geste, pas par les sous-catégories", assemblage.dependencies.length, 0);
  check("Heures exactes conservées", assemblage.hours, 12);
  check("Traçabilité de qui a débloqué", assemblage.releasedBy, "owner");
}
{
  const subassemblies = [];
  const entry = declareSubassemblyReady(subassemblies, { projectId: "2250", number: "14-000", declaredBy: "Marc" });
  markPartsListReady(entry, "owner", { "fabrication-usinage": 20 }); // pas d'assemblage déclaré du tout
  let threw = false;
  try { declareAssemblyReady(entry, "owner"); } catch (e) { threw = true; }
  check("Refuse de débloquer un assemblage qui n'a jamais été estimé", threw, true);
}
{
  const subassemblies = [];
  const entry = declareSubassemblyReady(subassemblies, { projectId: "2250", number: "15-000", declaredBy: "Marc" });
  let threw = false;
  try { declareAssemblyReady(entry, "owner"); } catch (e) { threw = true; } // liste de pièces pas encore créée
  check("Refuse de débloquer l'assemblage avant même la liste de pièces", threw, true);
}
{
  const subassemblies = [];
  const entry = declareSubassemblyReady(subassemblies, { projectId: "2250", number: "10-000", declaredBy: "Marc" });
  let threw = false;
  try { subassemblyGanttTasks(entry); } catch (e) { threw = true; }
  check("Refuse de générer les tâches avant que la liste de pièces soit prête", threw, true);
}

console.log(`\n${passed} réussi(s), ${failed} échoué(s)`);
process.exit(failed > 0 ? 1 : 0);
