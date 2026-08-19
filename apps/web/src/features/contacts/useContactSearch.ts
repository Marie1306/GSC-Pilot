import { useQuery } from "@tanstack/react-query";
import { fetchContacts, type ContactListItemDto } from "./api.js";

function normalize(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function matchScore(query: string, value: string | null): number {
  if (!value) return -1;
  const needle = normalize(query);
  const haystack = normalize(value);
  if (!needle) return -1;
  if (haystack === needle) return 3;
  if (haystack.startsWith(needle)) return 2;
  if (haystack.includes(needle)) return 1;
  return -1;
}

export type ContactSearchFieldKind = "company" | "name";

/**
 * Contacts déjà chargés au complet côté client (comme ContactList) — le
 * carnet d'une équipe de 4-10 personnes reste petit, une recherche serveur
 * dédiée serait prématurée.
 */
export function useContactSearch() {
  const contactsQuery = useQuery({ queryKey: ["contacts"], queryFn: fetchContacts, staleTime: 60_000 });
  const contacts = contactsQuery.data?.contacts ?? [];

  function search(query: string, field: ContactSearchFieldKind, limit = 8): ContactListItemDto[] {
    if (!query.trim()) return [];
    return contacts
      .map((contact) => ({ contact, score: matchScore(query, field === "company" ? contact.company : contact.name) }))
      .filter((entry) => entry.score > 0)
      .sort((a, b) => b.score - a.score || a.contact.name.localeCompare(b.contact.name))
      .slice(0, limit)
      .map((entry) => entry.contact);
  }

  return { search };
}
