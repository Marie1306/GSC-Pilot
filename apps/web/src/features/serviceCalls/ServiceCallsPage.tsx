import { useState } from "react";
import { ServiceCallList } from "./ServiceCallList.js";
import { ServiceCallDetail } from "./ServiceCallDetail.js";
import { ServiceCallForm } from "./ServiceCallForm.js";

export function ServiceCallsPage() {
  const [openId, setOpenId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  return (
    <div>
      <ServiceCallList onOpen={setOpenId} onCreate={() => setCreating(true)} />
      {openId && <ServiceCallDetail id={openId} onClose={() => setOpenId(null)} />}
      {creating && <ServiceCallForm onClose={() => setCreating(false)} />}
    </div>
  );
}
