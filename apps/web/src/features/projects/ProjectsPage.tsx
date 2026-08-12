import { useState } from "react";
import { ProjectList } from "./ProjectList.js";
import { ProjectDetail } from "./ProjectDetail.js";

export function ProjectsPage() {
  const [openId, setOpenId] = useState<string | null>(null);

  return (
    <div>
      <ProjectList onOpen={setOpenId} />
      {openId && <ProjectDetail id={openId} onClose={() => setOpenId(null)} />}
    </div>
  );
}
