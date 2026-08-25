import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { fetchContacts } from "./api.js";
import "./contacts.css";

interface ContactListProps {
  onOpen: (id: string) => void;
  onCreate: () => void;
}

const TYPE_TABS: { key: "all" | "Client" | "Fournisseur"; label: string }[] = [
  { key: "all", label: "Tous" },
  { key: "Client", label: "Clients" },
  { key: "Fournisseur", label: "Fournisseurs" },
];

function matches(query: string, ...values: (string | null)[]): boolean {
  const needle = query.trim().toLowerCase();
  if (!needle) return true;
  return values.some((value) => value?.toLowerCase().includes(needle));
}

export function ContactList({ onOpen, onCreate }: ContactListProps) {
  const listQuery = useQuery({ queryKey: ["contacts"], queryFn: fetchContacts });
  const [tab, setTab] = useState<"all" | "Client" | "Fournisseur">("all");
  const [search, setSearch] = useState("");
  const rows = (listQuery.data?.contacts ?? [])
    .filter((row) => tab === "all" || row.type === tab)
    .filter((row) => matches(search, row.name, row.company, row.email));

  return (
    <div>
      <section className="card">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap", marginBottom: 14 }}>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {TYPE_TABS.map((t) => (
              <button
                key={t.key}
                type="button"
                className={tab === t.key ? "btn btn-small" : "btn btn-secondary btn-small"}
                onClick={() => setTab(t.key)}
              >
                {t.label}
              </button>
            ))}
          </div>
          <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
            <input
              type="search"
              placeholder="Rechercher par nom, entreprise ou courriel…"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              style={{ maxWidth: 260 }}
            />
            <button type="button" className="btn" onClick={onCreate}>
              + Nouveau contact
            </button>
          </div>
        </div>
        <div style={{ overflowX: "auto" }}>
          <table className="contact-table">
            <thead>
              <tr>
                <th>Nom</th>
                <th>Entreprise</th>
                <th>Type</th>
                <th>Téléphone</th>
                <th>Courriel</th>
                <th>Catégories</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 && (
                <tr>
                  <td colSpan={6} style={{ color: "var(--gsc-color-muted)" }}>
                    Aucun contact.
                  </td>
                </tr>
              )}
              {rows.map((row) => (
                <tr key={row.id} onClick={() => onOpen(row.id)} style={{ cursor: "pointer" }}>
                  <td>{row.name}</td>
                  <td>{row.company ?? "—"}</td>
                  <td>{row.type}</td>
                  <td>{row.phone ?? "—"}</td>
                  <td>{row.email ?? "—"}</td>
                  <td>
                    {row.categories.map((category) => (
                      <span key={category} className="badge-pill badge-neutral" style={{ marginRight: 4 }}>
                        {category}
                      </span>
                    ))}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
