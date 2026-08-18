import { useState } from "react";
import { useSearchParams } from "react-router-dom";
import { canCreateBudgetFromRequest } from "@gsc-pilot/business-rules";
import { useAuth } from "../../lib/auth/useAuth.js";
import { BudgetList } from "./BudgetList.js";
import { BudgetForm } from "./BudgetForm.js";
import { BudgetDetail } from "./BudgetDetail.js";
import "./budgets.css";

/** "Accéder au Budgétaire" depuis le menu Options d'un projet (Projet 2F,
 * 17 août 2026) navigue vers /budgetaire?open=<id> — lu une seule fois au
 * montage, même patron que l'ouverture depuis la liste. "Créer le
 * budgétaire" depuis le menu Options d'une demande client (18 août 2026)
 * navigue vers /budgetaire?newFromRequest=<id> — ouvre le formulaire avec
 * cette demande déjà présélectionnée plutôt que de la faire rechercher dans
 * la liste déroulante. */
export function BudgetsPage() {
  const { employee } = useAuth();
  const [searchParams] = useSearchParams();
  const [newFromRequestId] = useState<string | null>(() => searchParams.get("newFromRequest"));
  const [showForm, setShowForm] = useState(() => !!newFromRequestId);
  const [openId, setOpenId] = useState<string | null>(() => searchParams.get("open"));

  if (!employee) return null;

  return (
    <div>
      {canCreateBudgetFromRequest(employee.persona) && (
        <button type="button" className="btn" onClick={() => setShowForm(true)}>
          + Nouveau budgétaire
        </button>
      )}

      <BudgetList onOpen={setOpenId} />

      {showForm && (
        <BudgetForm
          initialRequestId={newFromRequestId ?? undefined}
          onClose={() => setShowForm(false)}
          onCreated={(id) => {
            setShowForm(false);
            setOpenId(id);
          }}
        />
      )}
      {openId && <BudgetDetail id={openId} onClose={() => setOpenId(null)} />}
    </div>
  );
}
