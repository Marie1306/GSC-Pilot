import { useState } from "react";
import { useSearchParams } from "react-router-dom";
import { ExternalSaleList } from "./ExternalSaleList.js";
import { ExternalSaleDetail } from "./ExternalSaleDetail.js";
import { ExternalSaleForm } from "./ExternalSaleForm.js";
import { ExternalSaleQuoteDetail } from "../externalSaleQuotes/ExternalSaleQuoteDetail.js";
import { ExternalSaleQuoteForm } from "../externalSaleQuotes/ExternalSaleQuoteForm.js";

/** ?open=<id> / ?create=1 — même patron que ProjectsPage.tsx (8 septembre 2026). ?openQuote=<id> / ?createQuote=1 — même patron, pour la Soumission (23 novembre 2026). */
export function ExternalSalesPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [openId, setOpenId] = useState<string | null>(() => searchParams.get("open"));
  const [localCreating, setLocalCreating] = useState(false);
  const creating = localCreating || searchParams.get("create") === "1";
  const [openQuoteId, setOpenQuoteId] = useState<string | null>(() => searchParams.get("openQuote"));
  const [localCreatingQuote, setLocalCreatingQuote] = useState(false);
  const creatingQuote = localCreatingQuote || searchParams.get("createQuote") === "1";

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

  function closeQuoteForm() {
    setLocalCreatingQuote(false);
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        next.delete("createQuote");
        return next;
      },
      { replace: true },
    );
  }

  return (
    <div>
      <ExternalSaleList onOpen={setOpenId} onCreate={() => setLocalCreating(true)} onOpenQuote={setOpenQuoteId} onCreateQuote={() => setLocalCreatingQuote(true)} />
      {openId && <ExternalSaleDetail id={openId} onClose={() => setOpenId(null)} />}
      {creating && (
        <ExternalSaleForm
          onClose={closeForm}
          onCreated={(id) => {
            closeForm();
            setOpenId(id);
          }}
        />
      )}
      {openQuoteId && (
        <ExternalSaleQuoteDetail
          id={openQuoteId}
          onClose={() => setOpenQuoteId(null)}
          onConverted={(saleId) => {
            setOpenQuoteId(null);
            setOpenId(saleId);
          }}
        />
      )}
      {creatingQuote && (
        <ExternalSaleQuoteForm
          onClose={closeQuoteForm}
          onCreated={(id) => {
            closeQuoteForm();
            setOpenQuoteId(id);
          }}
        />
      )}
    </div>
  );
}
