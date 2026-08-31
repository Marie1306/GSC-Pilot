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
 * la liste déroulante. "Budgétaire" depuis Ajouter rapidement (31 août
 * 2026) navigue vers /budgetaire?create=1 — sans demande présélectionnée.
 * Les deux derniers sont dérivés de searchParams à chaque rendu (jamais un
 * état capturé une seule fois au montage) — voir ClientRequestsPage.tsx
 * pour l'explication du patron. */
export function BudgetsPage() {
  const { employee } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const newFromRequestId = searchParams.get("newFromRequest");
  const [localShowForm, setLocalShowForm] = useState(false);
  const showForm = localShowForm || searchParams.get("create") === "1" || !!newFromRequestId;
  const [openId, setOpenId] = useState<string | null>(() => searchParams.get("open"));

  function closeForm() {
    setLocalShowForm(false);
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        next.delete("create");
        next.delete("newFromRequest");
        return next;
      },
      { replace: true },
    );
  }

  if (!employee) return null;

  return (
    <div>
      <BudgetList onOpen={setOpenId} onCreate={() => setLocalShowForm(true)} canCreate={canCreateBudgetFromRequest(employee.persona)} />

      {showForm && (
        <BudgetForm
          initialRequestId={newFromRequestId ?? undefined}
          onClose={closeForm}
          onCreated={(id) => {
            closeForm();
            setOpenId(id);
          }}
        />
      )}
      {openId && <BudgetDetail id={openId} onClose={() => setOpenId(null)} />}
    </div>
  );
}
