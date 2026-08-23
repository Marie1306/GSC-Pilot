import { useState } from "react";
import { useSearchParams } from "react-router-dom";
import { ProjectList } from "./ProjectList.js";
import { ProjectDetail } from "./ProjectDetail.js";
import { ProjectForm } from "./ProjectForm.js";

/** ?open=<id> lu une seule fois au montage (23 août 2026, même patron que Budgétaire/Demandes clients) — utilisé par le Scan QR pour Direction/Administration/Propriétaire. */
export function ProjectsPage() {
  const [searchParams] = useSearchParams();
  const [openId, setOpenId] = useState<string | null>(() => searchParams.get("open"));
  const [creating, setCreating] = useState(false);

  return (
    <div>
      <ProjectList onOpen={setOpenId} onCreate={() => setCreating(true)} />
      {openId && <ProjectDetail id={openId} onClose={() => setOpenId(null)} />}
      {creating && (
        <ProjectForm
          onClose={() => setCreating(false)}
          onCreated={(id) => {
            setCreating(false);
            setOpenId(id);
          }}
        />
      )}
    </div>
  );
}
