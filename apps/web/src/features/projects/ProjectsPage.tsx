import { useState } from "react";
import { ProjectList } from "./ProjectList.js";
import { ProjectDetail } from "./ProjectDetail.js";
import { ProjectForm } from "./ProjectForm.js";

export function ProjectsPage() {
  const [openId, setOpenId] = useState<string | null>(null);
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
