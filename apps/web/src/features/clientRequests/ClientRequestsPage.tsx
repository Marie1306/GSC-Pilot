import { useState } from "react";
import { useSearchParams } from "react-router-dom";
import { canCreateClientRequest } from "@gsc-pilot/business-rules";
import { useAuth } from "../../lib/auth/useAuth.js";
import { ClientRequestList } from "./ClientRequestList.js";
import { ClientRequestForm } from "./ClientRequestForm.js";
import { ClientRequestDetail } from "./ClientRequestDetail.js";
import "./clientRequests.css";

/** "Accéder à la demande" depuis le menu Options d'un projet (Projet 2F,
 * 17 août 2026) navigue vers /demandes?open=<id> — même patron que
 * BudgetsPage. "Demande client" depuis Ajouter rapidement (31 août 2026)
 * navigue vers /demandes?create=1 — dérivé de searchParams à chaque rendu
 * (jamais un état capturé une seule fois au montage) car ce bouton est
 * accessible depuis n'importe quelle page, y compris /demandes elle-même :
 * React Router ne remonte pas ce composant pour une navigation vers la même
 * route (voir ActionCenterPage.tsx, correctif du 31 août 2026). */
export function ClientRequestsPage() {
  const { employee } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const [localShowForm, setLocalShowForm] = useState(false);
  const showForm = localShowForm || searchParams.get("create") === "1";
  const [openId, setOpenId] = useState<string | null>(() => searchParams.get("open"));

  function closeForm() {
    setLocalShowForm(false);
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        next.delete("create");
        return next;
      },
      { replace: true },
    );
  }

  if (!employee) return null;

  return (
    <div>
      <ClientRequestList onOpen={setOpenId} onCreate={() => setLocalShowForm(true)} canCreate={canCreateClientRequest(employee.persona)} />

      {showForm && <ClientRequestForm onClose={closeForm} />}
      {openId && <ClientRequestDetail id={openId} onClose={() => setOpenId(null)} />}
    </div>
  );
}
