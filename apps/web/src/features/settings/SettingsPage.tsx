import { PurchaseCategoriesCard } from "./PurchaseCategoriesCard.js";
import { MarginThresholdsCard } from "./MarginThresholdsCard.js";
import { TechLevelsCard } from "./TechLevelsCard.js";
import { ServiceRatesCard } from "./ServiceRatesCard.js";
import { EmployeesCard } from "./EmployeesCard.js";
import { SalesChannelsCard } from "./SalesChannelsCard.js";
import { PunchableTasksCard } from "./PunchableTasksCard.js";
import { BillingSplitCard } from "./BillingSplitCard.js";
import { AuditLogCard } from "./AuditLogCard.js";

/**
 * Direction seulement (voir canAccessSettings, déjà appliqué au niveau de
 * la route dans App.tsx). Modèles d'export PDF et délégation restent hors
 * de cette passe (20 août 2026) — portée confirmée avec l'utilisatrice.
 */
export function SettingsPage() {
  return (
    <div>
      <div className="card">
        <h1 style={{ marginTop: 0, fontSize: 20 }}>Paramètres</h1>
        <p style={{ color: "var(--gsc-color-muted)" }}>
          Les modèles d'export PDF et la délégation d'approbation arrivent dans une prochaine phase.
        </p>
      </div>
      <EmployeesCard />
      <TechLevelsCard />
      <ServiceRatesCard />
      <PurchaseCategoriesCard />
      <MarginThresholdsCard />
      <SalesChannelsCard />
      <PunchableTasksCard />
      <BillingSplitCard />
      <AuditLogCard />
    </div>
  );
}
