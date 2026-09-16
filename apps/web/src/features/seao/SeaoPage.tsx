import { useState } from "react";
import { useSearchParams } from "react-router-dom";
import { SeaoList } from "./SeaoList.js";
import { SeaoDetail } from "./SeaoDetail.js";
import { SeaoForm } from "./SeaoForm.js";

/** ?open=<id> / ?create=1 — même patron que ExternalSalesPage.tsx. */
export function SeaoPage() {
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
      <SeaoList onOpen={setOpenId} onCreate={() => setLocalCreating(true)} />
      {openId && <SeaoDetail id={openId} onClose={() => setOpenId(null)} />}
      {creating && (
        <SeaoForm
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
