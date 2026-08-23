import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { fetchContactDetail, type LinkedRecordDto } from "./api.js";
import { ContactForm } from "./ContactForm.js";
import "./contacts.css";

interface ContactDetailProps {
  id: string;
  onClose: () => void;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("fr-CA", { year: "numeric", month: "long", day: "numeric" });
}

function LinkedRecordSection({ title, rows }: { title: string; rows: LinkedRecordDto[] }) {
  if (rows.length === 0) return null;
  return (
    <>
      <div className="section-heading" style={{ marginTop: 20 }}>
        <div>
          <h3>
            {title} ({rows.length})
          </h3>
        </div>
      </div>
      <div className="table-scroll">
      <table className="contact-table">
        <tbody>
          {rows.map((row) => (
            <tr key={row.id}>
              <td>{row.displayId}</td>
              <td>{row.label}</td>
              <td>
                <span className="badge-pill badge-neutral">{row.status}</span>
              </td>
              <td>{formatDate(row.createdAt)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      </div>
    </>
  );
}

export function ContactDetail({ id, onClose }: ContactDetailProps) {
  const detailQuery = useQuery({ queryKey: ["contact", id], queryFn: () => fetchContactDetail(id) });
  const contact = detailQuery.data?.contact;
  const [editing, setEditing] = useState(false);

  if (!contact) {
    return (
      <div className="modal-backdrop">
        <div className="modal">
          <div className="modal-body">{detailQuery.isError ? "Contact introuvable." : "Chargement…"}</div>
        </div>
      </div>
    );
  }

  return (
    <div className="modal-backdrop">
      <div className="modal" style={{ maxWidth: 720 }}>
        <div className="modal-header">
          <div>
            <h2>{contact.name}</h2>
            <p className="modal-subtitle">
              {contact.company ?? contact.type} · {contact.type}
            </p>
          </div>
          <button type="button" className="modal-close" onClick={onClose} aria-label="Fermer">
            ×
          </button>
        </div>

        <div className="modal-body">
          <div className="contact-info-grid">
            <div>
              <span className="contact-info-label">Téléphone</span>
              <div>{contact.phone ?? "—"}</div>
            </div>
            <div>
              <span className="contact-info-label">Courriel</span>
              <div>{contact.email ?? "—"}</div>
            </div>
            <div>
              <span className="contact-info-label">Rôle</span>
              <div>{contact.role ?? "—"}</div>
            </div>
            <div>
              <span className="contact-info-label">Catégories</span>
              <div>
                {contact.categories.length > 0
                  ? contact.categories.map((category) => (
                      <span key={category} className="badge-pill badge-neutral" style={{ marginRight: 4 }}>
                        {category}
                      </span>
                    ))
                  : "—"}
              </div>
            </div>
          </div>

          <LinkedRecordSection title="Demandes clients" rows={contact.clientRequests} />
          <LinkedRecordSection title="Projets" rows={contact.projects} />
          <LinkedRecordSection title="Roulements" rows={contact.rollings} />
          <LinkedRecordSection title="Appels de service" rows={contact.serviceCalls} />
          <LinkedRecordSection title="Livraisons" rows={contact.deliveries} />

          {contact.clientRequests.length === 0 &&
            contact.projects.length === 0 &&
            contact.rollings.length === 0 &&
            contact.serviceCalls.length === 0 &&
            contact.deliveries.length === 0 && (
              <p style={{ color: "var(--gsc-color-muted)", marginTop: 20 }}>Aucun dossier lié pour l'instant.</p>
            )}
        </div>

        <div className="modal-footer">
          <button type="button" className="btn btn-secondary" onClick={onClose}>
            Fermer
          </button>
          <button type="button" className="btn" onClick={() => setEditing(true)}>
            Modifier
          </button>
        </div>
      </div>

      {editing && <ContactForm contact={contact} onClose={() => setEditing(false)} />}
    </div>
  );
}
