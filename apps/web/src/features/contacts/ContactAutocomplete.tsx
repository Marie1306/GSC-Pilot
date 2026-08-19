import { useEffect, useRef, useState } from "react";
import type { ContactListItemDto } from "./api.js";
import { useContactSearch, type ContactSearchFieldKind } from "./useContactSearch.js";
import "./contacts.css";

interface ContactSearchFieldProps {
  id: string;
  label: string;
  field: ContactSearchFieldKind;
  value: string;
  onChange: (value: string) => void;
  onSelect: (contact: ContactListItemDto) => void;
  required?: boolean;
  placeholder?: string;
}

/**
 * Champ Entreprise ou Nom du contact avec suggestions provenant du carnet de
 * contacts — sélectionner une suggestion remplit aussi les autres champs
 * (entreprise/téléphone/courriel/poste) via onSelect, demandé le 19 août
 * 2026 pour éviter de retaper les coordonnées d'un client déjà connu.
 */
export function ContactSearchField({ id, label, field, value, onChange, onSelect, required, placeholder }: ContactSearchFieldProps) {
  const { search } = useContactSearch();
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const suggestions = open ? search(value, field) : [];

  useEffect(() => {
    function onPointerDownOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onPointerDownOutside);
    return () => document.removeEventListener("mousedown", onPointerDownOutside);
  }, []);

  return (
    <div className="field contact-autocomplete" ref={containerRef}>
      <label htmlFor={id}>{label}</label>
      <input
        id={id}
        required={required}
        placeholder={placeholder}
        autoComplete="off"
        value={value}
        onChange={(event) => {
          onChange(event.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
      />
      {open && suggestions.length > 0 && (
        <ul className="contact-autocomplete-menu">
          {suggestions.map((contact) => (
            <li key={contact.id}>
              <button
                type="button"
                onMouseDown={(event) => {
                  event.preventDefault();
                  onSelect(contact);
                  setOpen(false);
                }}
              >
                <span className="contact-autocomplete-primary">{(field === "company" ? contact.company : contact.name) ?? "—"}</span>
                <span className="contact-autocomplete-secondary">
                  {field === "company" ? contact.name : (contact.company ?? "—")}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
