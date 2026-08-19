import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { fetchContacts } from "./api.js";
import "./contacts.css";

interface ContactListProps {
  onOpen: (id: string) => void;
  onCreate: () => void;
}

function matches(query: string, ...values: (string | null)[]): boolean {
  const needle = query.trim().toLowerCase();
  if (!needle) return true;
  return values.some((value) => value?.toLowerCase().includes(needle));
}

export function ContactList({ onOpen, onCreate }: ContactListProps) {
  const listQuery = useQuery({ queryKey: ["contacts"], queryFn: fetchContacts });
  const [search, setSearch] = useState("");
  const rows = (listQuery.data?.contacts ?? []).filter((row) => matches(search, row.name, row.company, row.email));

  return (
    <div>
      <div className="card" style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 16, flexWrap: "wrap" }}>
        <div>
          <h1 style={{ marginTop: 0, fontSize: 20 }}>Contacts</h1>
          <p style={{ color: "var(--gsc-color-muted)", margin: 0 }}>
            Carnet d'adresses — la plupart des contacts s'ajoutent automatiquement (demandes, appels de service).
          </p>
        </div>
        <button type="button" className="btn" onClick={onCreate}>
          + Nouveau contact
        </button>
      </div>

      <section className="card" style={{ marginTop: 20 }}>
        <input
          type="search"
          placeholder="Rechercher par nom, entreprise ou courriel…"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          style={{ marginBottom: 12, maxWidth: 360 }}
        />
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
