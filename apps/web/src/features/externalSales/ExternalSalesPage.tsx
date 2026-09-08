import { useState } from "react";
import { useSearchParams } from "react-router-dom";
import { ExternalSaleList } from "./ExternalSaleList.js";
import { ExternalSaleDetail } from "./ExternalSaleDetail.js";
import { ExternalSaleForm } from "./ExternalSaleForm.js";

/** ?open=<id> / ?create=1 — même patron que ProjectsPage.tsx (8 septembre 2026). */
export function ExternalSalesPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [openId, setOpenId] = useState<string | null>(() => searchParams.get("open"));
  const [localCreating, setLocalCreating] = useState(false);
  const creating = localCreating || searchParams.get("create") === "1";

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

  return (
    <div>
      <ExternalSaleList onOpen={setOpenId} onCreate={() => setLocalCreating(true)} />
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
    </div>
  );
}
