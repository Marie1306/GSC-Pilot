/**
 * GSC Pilot v01 — Contacts
 *
 * Confirmé le 9 août 2026 : chaque nouvelle demande client, projet ou
 * roulement où un client est inscrit doit s'enregistrer automatiquement
 * dans le carnet de contacts, sans doublon. Reprend la logique déjà
 * vérifiée dans la v19 (ensureClientContact) — trouvée fonctionnelle mais
 * seulement branchée sur les demandes clients avant correctif; maintenant
 * branchée aussi sur les projets et roulements créés directement.
 */

const CATEGORY_BY_SOURCE = Object.freeze({
  project: "Projet",
  rolling: "Roulement",
  service: "Service",
  information: "Information",
});

/**
 * Trouve ou crée le contact correspondant. Déduplique par courriel
 * d'abord, puis par nom (insensible à la casse et aux espaces) — jamais
 * par entreprise seule, pour éviter de fusionner deux personnes
 * différentes d'une même compagnie.
 */
export function ensureContact(contacts, data) {
  const email = String(data.email || "").trim().toLowerCase();
  const name = String(data.contactName || data.name || "").trim().toLowerCase();
  const company = String(data.company || "").trim();
  const category = CATEGORY_BY_SOURCE[data.requestType] || "Information";

  const existing = contacts.find(
    (contact) =>
      (email && String(contact.email || "").trim().toLowerCase() === email) ||
      (name && String(contact.name || "").trim().toLowerCase() === name)
  );

  if (existing) {
    existing.phone ||= data.phone || "";
    existing.email ||= data.email || "";
    existing.company ||= company;
    existing.role ||= data.contactRole || "Contact client";
    existing.categories ||= ["Client"];
    if (!existing.categories.includes(category)) existing.categories.push(category);
    return existing;
  }

  const created = {
    id: data.id || `C-${Date.now()}`,
    type: "Client",
    company,
    name: String(data.contactName || data.name || "").trim(),
    role: data.contactRole || "Contact client",
    email: data.email || "",
    phone: data.phone || "",
    categories: ["Client", category],
  };
  contacts.push(created);
  return created;
}
