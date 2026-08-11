import { useState } from "react";
import { canCreateClientRequest } from "@gsc-pilot/business-rules";
import { useAuth } from "../../lib/auth/useAuth.js";
import { ClientRequestList } from "./ClientRequestList.js";
import { ClientRequestForm } from "./ClientRequestForm.js";
import { ClientRequestDetail } from "./ClientRequestDetail.js";
import "./clientRequests.css";

export function ClientRequestsPage() {
  const { employee } = useAuth();
  const [showForm, setShowForm] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);

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
