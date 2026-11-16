interface ListFilterBarProps {
  search: string;
  onSearchChange: (value: string) => void;
  searchPlaceholder: string;
  // Omis (pas de champs prix min/max) quand le module n'a pas de montant
  // disponible pour ce rôle — jamais une valeur devinée (voir
  // ServiceCallList.tsx, Call de service sans canSeeServicePricing).
  minPrice?: string;
  maxPrice?: string;
  onMinPriceChange?: (value: string) => void;
  onMaxPriceChange?: (value: string) => void;
}

/**
 * Barre de filtre présentationnelle partagée (16 novembre 2026, Chantier
 * C Partie B) — réutilisée telle quelle sur les 4 listes (Projets/
 * Roulements/Calls de service/Ventes externes). Chaque page garde son
 * propre état (search/minPrice/maxPrice) et sa propre logique de
 * filtrage (les champs comparés diffèrent par module, jamais une règle
 * générique devinée) — ce composant ne fait que rendre les champs.
 */
export function ListFilterBar({ search, onSearchChange, searchPlaceholder, minPrice, maxPrice, onMinPriceChange, onMaxPriceChange }: ListFilterBarProps) {
  const showPriceInputs = onMinPriceChange !== undefined && onMaxPriceChange !== undefined;

  return (
    <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 16 }}>
      <input
        type="text"
        placeholder={searchPlaceholder}
        value={search}
        onChange={(event) => onSearchChange(event.target.value)}
        style={{ flex: "1 1 220px", minWidth: 180 }}
      />
      {showPriceInputs && (
        <>
          <input
            type="number"
            placeholder="Prix min"
            value={minPrice}
            onChange={(event) => onMinPriceChange(event.target.value)}
            style={{ width: 110 }}
          />
          <input
            type="number"
            placeholder="Prix max"
            value={maxPrice}
            onChange={(event) => onMaxPriceChange(event.target.value)}
            style={{ width: 110 }}
          />
        </>
      )}
    </div>
  );
}
