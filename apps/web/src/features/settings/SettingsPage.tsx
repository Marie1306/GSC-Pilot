import { PurchaseCategoriesCard } from "./PurchaseCategoriesCard.js";
import { MarginThresholdsCard } from "./MarginThresholdsCard.js";
import { TechLevelsCard } from "./TechLevelsCard.js";
import { ServiceRatesCard } from "./ServiceRatesCard.js";
import { EmployeesCard } from "./EmployeesCard.js";
import { SalesChannelsCard } from "./SalesChannelsCard.js";
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
import { PunchableTasksCard } from "./PunchableTasksCard.js";
import { BillingSplitCard } from "./BillingSplitCard.js";
import { AuditLogCard } from "./AuditLogCard.js";
import { DelegationCard } from "./DelegationCard.js";

/**
 * Direction seulement (voir canAccessSettings, déjà appliqué au niveau de
 * la route dans App.tsx). Modèles d'export PDF restent hors de cette passe
 * (20 août 2026, portée à clarifier) — la délégation, construite le 23 août
 * 2026, ne l'est plus.
 */
export function SettingsPage() {
  return (
    <div>
      <div className="card">
        <h1 style={{ marginTop: 0, fontSize: 20 }}>Paramètres</h1>
        <p style={{ color: "var(--gsc-color-muted)" }}>Les modèles d'export PDF arrivent dans une prochaine phase.</p>
      </div>
      <EmployeesCard />
      <TechLevelsCard />
      <ServiceRatesCard />
      <PurchaseCategoriesCard />
      <MarginThresholdsCard />
      <SalesChannelsCard />
      <ChecklistCatalogCard
        title="Checklist de production — Épaisseurs"
        description="Liste des épaisseurs offertes à la création d'une pièce (ex. 12GA, 1/4)."
        queryKey="checklist-thicknesses"
        fetchFn={fetchChecklistThicknesses}
        createFn={createChecklistThickness}
        updateFn={updateChecklistThickness}
      />
      <ChecklistCatalogCard
        title="Checklist de production — Matériaux"
        description="Liste des matériaux offerts à la création d'une pièce (ex. Acier, Stainless, Alu)."
        queryKey="checklist-materials"
        fetchFn={fetchChecklistMaterials}
        createFn={createChecklistMaterial}
        updateFn={updateChecklistMaterial}
      />
      <ChecklistCatalogCard
        title="Checklist de production — Étapes de fabrication"
        description="Les colonnes de la grille (MEP, DXF, Plasma, Pliage, Usinage, Soudage, CQ, Peinture)."
        queryKey="checklist-steps"
        fetchFn={fetchChecklistSteps}
        createFn={createChecklistStep}
        updateFn={updateChecklistStep}
      />
      <PunchableTasksCard />
      <BillingSplitCard />
      <DelegationCard />
      <AuditLogCard />
    </div>
  );
}
