import { ApprovedHoursDrilldown } from "./ApprovedHoursDrilldown.js";

interface ProjectHoursDetailProps {
  project: { id: string; projectNumber: string; name: string };
  onClose: () => void;
}

/**
 * "Consulter les heures" du menu Options (27 août 2026) — même contenu que
 * le détail des heures approuvées du Post-mortem (ApprovedHoursDrilldown),
 * ici toujours affiché dès l'ouverture : la fermeture de cette modale est
 * déjà le mécanisme de bascule, pas besoin d'un deuxième bouton replier/
 * afficher à l'intérieur.
 */
export function ProjectHoursDetail({ project, onClose }: ProjectHoursDetailProps) {
  return (
    <div className="modal-backdrop">
      <div className="modal" style={{ maxWidth: 720 }} onClick={(event) => event.stopPropagation()}>
        <div className="modal-header">
          <div>
            <h2>Heures approuvées</h2>
            <p className="modal-subtitle">
              {project.projectNumber} — {project.name}
            </p>
          </div>
          <button type="button" className="modal-close" onClick={onClose} aria-label="Fermer">
            ×
          </button>
        </div>
        <div className="modal-body">
          <ApprovedHoursDrilldown projectId={project.id} />
        </div>
        <div className="modal-footer">
          <button type="button" className="btn btn-secondary" onClick={onClose}>
            Fermer
          </button>
        </div>
      </div>
    </div>
  );
}
