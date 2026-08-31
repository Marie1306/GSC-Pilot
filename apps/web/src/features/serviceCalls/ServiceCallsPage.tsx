import { useState } from "react";
import { useSearchParams } from "react-router-dom";
import { ServiceCallList } from "./ServiceCallList.js";
import { ServiceCallDetail } from "./ServiceCallDetail.js";
import { ServiceCallForm } from "./ServiceCallForm.js";

/** ?create=1 (31 août 2026, Ajouter rapidement) dérivé de searchParams à
 * chaque rendu — voir ClientRequestsPage.tsx pour l'explication du patron. */
export function ServiceCallsPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [openId, setOpenId] = useState<string | null>(null);
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
      <ServiceCallList onOpen={setOpenId} onCreate={() => setLocalCreating(true)} />
      {openId && <ServiceCallDetail id={openId} onClose={() => setOpenId(null)} />}
      {creating && <ServiceCallForm onClose={closeForm} />}
    </div>
  );
}
