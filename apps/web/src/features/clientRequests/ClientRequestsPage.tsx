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
 * BudgetsPage. */
export function ClientRequestsPage() {
  const { employee } = useAuth();
  const [searchParams] = useSearchParams();
  const [showForm, setShowForm] = useState(false);
  const [openId, setOpenId] = useState<string | null>(() => searchParams.get("open"));

  if (!employee) return null;

  return (
    <div>
      {canCreateClientRequest(employee.persona) && (
        <button type="button" className="btn" onClick={() => setShowForm(true)}>
          + Nouvelle demande client
        </button>
      )}

      <ClientRequestList onOpen={setOpenId} />

      {showForm && <ClientRequestForm onClose={() => setShowForm(false)} />}
      {openId && <ClientRequestDetail id={openId} onClose={() => setOpenId(null)} />}
    </div>
  );
}
