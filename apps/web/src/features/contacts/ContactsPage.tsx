import { useState } from "react";
import { useSearchParams } from "react-router-dom";
import { ContactList } from "./ContactList.js";
import { ContactDetail } from "./ContactDetail.js";
import { ContactForm } from "./ContactForm.js";

/** ?open=<id> lu une seule fois au montage (27 août 2026, même patron que Projets/Budgétaire/Demandes clients) — utilisé par "Accéder au contact" depuis le menu Options d'un projet. */
export function ContactsPage() {
  const [searchParams] = useSearchParams();
  const [openId, setOpenId] = useState<string | null>(() => searchParams.get("open"));
  const [creating, setCreating] = useState(false);

  return (
    <div>
      <ContactList onOpen={setOpenId} onCreate={() => setCreating(true)} />
      {openId && <ContactDetail id={openId} onClose={() => setOpenId(null)} />}
      {creating && <ContactForm onClose={() => setCreating(false)} />}
    </div>
  );
}
