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
 * montage, même patron que l'ouverture depuis la liste. */
export function BudgetsPage() {
  const { employee } = useAuth();
  const [searchParams] = useSearchParams();
  const [showForm, setShowForm] = useState(false);
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
