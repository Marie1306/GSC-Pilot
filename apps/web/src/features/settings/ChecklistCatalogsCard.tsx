import { useState } from "react";
import { ChecklistCatalogCard } from "./ChecklistCatalogCard.js";
import {
  fetchChecklistThicknesses,
  createChecklistThickness,
  updateChecklistThickness,
  fetchChecklistMaterials,
  createChecklistMaterial,
  updateChecklistMaterial,
  fetchChecklistSteps,
  createChecklistStep,
  updateChecklistStep,
} from "./api.js";

/**
 * Regroupe les 3 catalogues du module Checklist de production (Épaisseurs/
 * Matériaux/Étapes) sous une seule catégorie Paramètres — demandé le 26 août
 * 2026 pour éviter 3 cartes séparées sur la page. Chaque liste reste
 * exactement le même composant générique (ChecklistCatalogCard, jamais
 * modifié), simplement déplacé dans une fenêtre contextuelle plutôt que sur
 * la page directement.
 */
export function ChecklistCatalogsCard() {
  const [open, setOpen] = useState(false);

  return (
    <div className="card" style={{ marginTop: 20 }}>
      <div className="card-band-header">
        <div>
          <h3>Checklist de production</h3>
          <p className="modal-subtitle">Épaisseurs, matériaux et étapes de fabrication offertes à la création d'une pièce.</p>
        </div>
        <button type="button" className="btn" onClick={() => setOpen(true)}>
          Gérer les catalogues
        </button>
      </div>

      {open && (
        <div className="modal-backdrop" onClick={() => setOpen(false)}>
          <div className="modal" style={{ maxWidth: 760 }} onClick={(event) => event.stopPropagation()}>
            <div className="modal-header">
              <div>
                <h2>Checklist de production</h2>
                <p className="modal-subtitle">Épaisseurs, matériaux et étapes de fabrication.</p>
              </div>
              <button type="button" className="modal-close" aria-label="Fermer" onClick={() => setOpen(false)}>
                ×
              </button>
            </div>
            <div className="modal-body">
              <ChecklistCatalogCard
                title="Épaisseurs"
                description="Liste des épaisseurs offertes à la création d'une pièce (ex. 12GA, 1/4)."
                queryKey="checklist-thicknesses"
                fetchFn={fetchChecklistThicknesses}
                createFn={createChecklistThickness}
                updateFn={updateChecklistThickness}
              />
              <ChecklistCatalogCard
                title="Matériaux"
                description="Liste des matériaux offerts à la création d'une pièce (ex. Acier, Stainless, Alu)."
                queryKey="checklist-materials"
                fetchFn={fetchChecklistMaterials}
                createFn={createChecklistMaterial}
                updateFn={updateChecklistMaterial}
              />
              <ChecklistCatalogCard
                title="Étapes de fabrication"
                description="Les colonnes de la grille (MEP, DXF, Plasma, Pliage, Usinage, Soudage, CQ, Peinture)."
                queryKey="checklist-steps"
                fetchFn={fetchChecklistSteps}
                createFn={createChecklistStep}
                updateFn={updateChecklistStep}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
