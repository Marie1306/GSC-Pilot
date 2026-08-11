import { useState } from "react";
import { canCreateBudgetFromRequest } from "@gsc-pilot/business-rules";
import { useAuth } from "../../lib/auth/useAuth.js";
import { BudgetList } from "./BudgetList.js";
import { BudgetForm } from "./BudgetForm.js";
import { BudgetDetail } from "./BudgetDetail.js";
import "./budgets.css";

export function BudgetsPage() {
  const { employee } = useAuth();
  const [showForm, setShowForm] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);

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
