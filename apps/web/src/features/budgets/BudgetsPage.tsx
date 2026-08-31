import { useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { canCreateBudgetFromRequest } from "@gsc-pilot/business-rules";
import { useAuth } from "../../lib/auth/useAuth.js";
import { BudgetList } from "./BudgetList.js";
import { BudgetForm, type BudgetPrefillFromRolling } from "./BudgetForm.js";
import { BudgetDetail } from "./BudgetDetail.js";
import { fetchRollingDetail } from "../rollings/api.js";
import "./budgets.css";

/** "Accéder au Budgétaire" depuis le menu Options d'un projet (Projet 2F,
 * 17 août 2026) navigue vers /budgetaire?open=<id> — lu une seule fois au
 * montage, même patron que l'ouverture depuis la liste. "Créer le
 * budgétaire" depuis le menu Options d'une demande client (18 août 2026)
 * navigue vers /budgetaire?newFromRequest=<id> — ouvre le formulaire avec
 * cette demande déjà présélectionnée plutôt que de la faire rechercher dans
 * la liste déroulante. "Budgétaire" depuis Ajouter rapidement (31 août
 * 2026) navigue vers /budgetaire?create=1 — sans demande présélectionnée.
 * "Construire un budgétaire" depuis le menu Options d'un roulement déjà créé
 * directement (31 août 2026) navigue vers /budgetaire?newFromRolling=<id> —
 * le contact du roulement est récupéré ici (fetchRollingDetail) puisque
 * l'URL ne porte que l'id. Tous dérivés de searchParams à chaque rendu
 * (jamais un état capturé une seule fois au montage) — voir
 * ClientRequestsPage.tsx pour l'explication du patron. */
export function BudgetsPage() {
  const { employee } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const newFromRequestId = searchParams.get("newFromRequest");
  const newFromRollingId = searchParams.get("newFromRolling");
  const rollingQuery = useQuery({
    queryKey: ["rolling", newFromRollingId],
    queryFn: () => fetchRollingDetail(newFromRollingId!),
    enabled: !!newFromRollingId,
  });
  const [localShowForm, setLocalShowForm] = useState(false);
  const showForm = localShowForm || searchParams.get("create") === "1" || !!newFromRequestId || !!newFromRollingId;
  const [openId, setOpenId] = useState<string | null>(() => searchParams.get("open"));

  function closeForm() {
    setLocalShowForm(false);
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        next.delete("create");
        next.delete("newFromRequest");
        next.delete("newFromRolling");
        return next;
      },
      { replace: true },
    );
  }

  if (!employee) return null;

  const prefillFromRolling: BudgetPrefillFromRolling | undefined =
    newFromRollingId && rollingQuery.data
      ? {
          rollingId: newFromRollingId,
          rollingNumber: rollingQuery.data.rolling.rollingNumber,
          contactName: rollingQuery.data.rolling.contactName,
          company: rollingQuery.data.rolling.company ?? undefined,
          phone: rollingQuery.data.rolling.contactPhone ?? undefined,
          email: rollingQuery.data.rolling.contactEmail ?? undefined,
        }
      : undefined;

  return (
    <div>
      <BudgetList onOpen={setOpenId} onCreate={() => setLocalShowForm(true)} canCreate={canCreateBudgetFromRequest(employee.persona)} />

      {showForm && (!newFromRollingId || prefillFromRolling) && (
        <BudgetForm
          initialRequestId={newFromRequestId ?? undefined}
          prefillFromRolling={prefillFromRolling}
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
