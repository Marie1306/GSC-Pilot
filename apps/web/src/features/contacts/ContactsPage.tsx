import { useState } from "react";
import { ContactList } from "./ContactList.js";
import { ContactDetail } from "./ContactDetail.js";
import { ContactForm } from "./ContactForm.js";

export function ContactsPage() {
  const [openId, setOpenId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  return (
    <div>
      <ContactList onOpen={setOpenId} onCreate={() => setCreating(true)} />
      {openId && <ContactDetail id={openId} onClose={() => setOpenId(null)} />}
      {creating && <ContactForm onClose={() => setCreating(false)} />}
    </div>
  );
}
