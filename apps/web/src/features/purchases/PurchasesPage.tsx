import { useState } from "react";
import { PurchaseRequestForm } from "./PurchaseRequestForm.js";
import { ShortlistForm } from "./ShortlistForm.js";
import { PurchaseRequestList } from "./PurchaseRequestList.js";
import "./purchases.css";

type Tab = "request" | "shortlist";

/** Deux onglets, tous deux ouverts à tous les rôles depuis le 13 août 2026 (voir canSubmitPurchaseRequest, roles.ts). */
export function PurchasesPage() {
  const [tab, setTab] = useState<Tab>("request");

  return (
    <div>
      <div className="tabs" role="tablist" style={{ marginBottom: 16 }}>
        <button type="button" role="tab" aria-selected={tab === "request"} className={`tab ${tab === "request" ? "active" : ""}`} onClick={() => setTab("request")}>
          Demande d'achat
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === "shortlist"}
          className={`tab ${tab === "shortlist" ? "active" : ""}`}
          onClick={() => setTab("shortlist")}
        >
          Liste rapide de projet
        </button>
      </div>
      {tab === "request" ? <PurchaseRequestForm /> : <ShortlistForm />}
      <PurchaseRequestList />
    </div>
  );
}
