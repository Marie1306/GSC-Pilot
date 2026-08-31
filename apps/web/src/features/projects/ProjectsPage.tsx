import { useState } from "react";
import { useSearchParams } from "react-router-dom";
import { ProjectList } from "./ProjectList.js";
import { ProjectDetail } from "./ProjectDetail.js";
import { ProjectForm } from "./ProjectForm.js";

/** ?open=<id> lu une seule fois au montage (23 août 2026, même patron que Budgétaire/Demandes clients) — utilisé par le Scan QR pour Direction/Administration/Propriétaire.
 * ?create=1 (31 août 2026, Ajouter rapidement) dérivé de searchParams à
 * chaque rendu — voir ClientRequestsPage.tsx pour l'explication du même
 * patron (remontage impossible si on est déjà sur /projets). */
export function ProjectsPage() {
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
      <ProjectList onOpen={setOpenId} onCreate={() => setLocalCreating(true)} />
      {openId && <ProjectDetail id={openId} onClose={() => setOpenId(null)} />}
      {creating && (
        <ProjectForm
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
