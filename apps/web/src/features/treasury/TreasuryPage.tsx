import { useQuery } from "@tanstack/react-query";
import { fetchTreasurySettings } from "./api.js";
import { TreasurySettingsCard } from "./TreasurySettingsCard.js";
import { TreasuryForecastTable } from "./TreasuryForecastTable.js";
import { RecurringExpensesCard } from "./RecurringExpensesCard.js";
import { ManualEntriesCard } from "./ManualEntriesCard.js";
import { PendingForecastCard } from "./PendingForecastCard.js";

/**
 * Flux de trésorerie (nouveau module, 13 novembre 2026) — prérequis dur :
 * la refonte de la demande de facturation (numéro/taxes/échéance générés
 * par l'appli) devait exister avant, puisque c'est elle qui déclenche
 * l'entrée d'une facture dans ce prévisionnel. Direction+Propriétaire
 * seulement (canManageTreasury, roles.ts) — Administration exclue,
 * déviation confirmée explicitement par Marie.
 *
 * Tant que les soldes d'ouverture ne sont pas configurés (table neuve,
 * jamais seedée), seul le formulaire de configuration s'affiche — le reste
 * du module n'aurait aucun point de départ fiable.
 */
export function TreasuryPage() {
  const settingsQuery = useQuery({ queryKey: ["treasury", "settings"], queryFn: fetchTreasurySettings });
  const settings = settingsQuery.data?.settings ?? null;

  return (
    <div>
      <TreasurySettingsCard settings={settings} />

      {settings && (
        <>
          <div style={{ marginTop: 20 }}>
            <TreasuryForecastTable />
          </div>
          <RecurringExpensesCard />
          <ManualEntriesCard />
          <PendingForecastCard />
        </>
      )}
    </div>
  );
}
