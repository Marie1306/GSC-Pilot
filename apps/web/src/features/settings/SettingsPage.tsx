import { PurchaseCategoriesCard } from "./PurchaseCategoriesCard.js";
import { MarginThresholdsCard } from "./MarginThresholdsCard.js";
import { TechLevelsCard } from "./TechLevelsCard.js";
import { ServiceRatesCard } from "./ServiceRatesCard.js";
import { EmployeesCard } from "./EmployeesCard.js";
import { SalesChannelsCard } from "./SalesChannelsCard.js";
import { ChecklistCatalogsCard } from "./ChecklistCatalogsCard.js";
import { BudgetPunchableCard } from "./BudgetPunchableCard.js";
import { BillingSplitCard } from "./BillingSplitCard.js";
import { AuditLogCard } from "./AuditLogCard.js";
import { DelegationCard } from "./DelegationCard.js";
import { TrashCard } from "./TrashCard.js";

/**
 * Direction seulement (voir canAccessSettings, déjà appliqué au niveau de
 * la route dans App.tsx). Modèles d'export PDF restent hors de cette passe
 * (20 août 2026, portée à clarifier) — la délégation, construite le 23 août
 * 2026, ne l'est plus.
 */
export function SettingsPage() {
  return (
    <div>
      <EmployeesCard />
      <TechLevelsCard />
      <ServiceRatesCard />
      <PurchaseCategoriesCard />
      <MarginThresholdsCard />
      <SalesChannelsCard />
      <ChecklistCatalogsCard />
      <BudgetPunchableCard />
      <BillingSplitCard />
      <DelegationCard />
      <AuditLogCard />
      <TrashCard />
    </div>
  );
}
