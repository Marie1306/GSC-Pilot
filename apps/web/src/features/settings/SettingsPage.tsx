import { PurchaseCategoriesCard } from "./PurchaseCategoriesCard.js";

/** Direction seulement (voir canAccessSettings, déjà appliqué au niveau de la route dans App.tsx). */
export function SettingsPage() {
  return (
    <div>
      <div className="card">
        <h1 style={{ marginTop: 0, fontSize: 20 }}>Paramètres</h1>
        <p style={{ color: "var(--gsc-color-muted)" }}>
          Les autres sections (taux, canaux de vente, tâches punchables, modèles d'export, délégation) arrivent dans une prochaine phase.
        </p>
      </div>
      <PurchaseCategoriesCard />
    </div>
  );
}
