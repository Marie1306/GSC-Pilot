import { useState } from "react";
import { useSearchParams } from "react-router-dom";
import { ContactList } from "./ContactList.js";
import { ContactDetail } from "./ContactDetail.js";
import { ContactForm } from "./ContactForm.js";

/** ?open=<id> lu une seule fois au montage (27 août 2026, même patron que Projets/Budgétaire/Demandes clients) — utilisé par "Accéder au contact" depuis le menu Options d'un projet.
 * ?create=1 (31 août 2026, Ajouter rapidement) dérivé de searchParams à
 * chaque rendu — voir ClientRequestsPage.tsx pour l'explication du patron. */
export function ContactsPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [openId, setOpenId] = useState<string | null>(() => searchParams.get("open"));
  const [localCreating, setLocalCreating] = useState(false);
  const creating = localCreating || searchParams.get("create") === "1";

  function closeForm() {
    setLocalCreating(false);
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        next.delete("create");
        return next;
      },
      { replace: true },
    );
  }

  return (
    <div>
      <ContactList onOpen={setOpenId} onCreate={() => setLocalCreating(true)} />
      {openId && <ContactDetail id={openId} onClose={() => setOpenId(null)} />}
      {creating && <ContactForm onClose={closeForm} />}
    </div>
  );
}
