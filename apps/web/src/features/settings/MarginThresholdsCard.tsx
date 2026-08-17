import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { fetchMarginThresholds, updateMarginThresholds, type MarginThresholdsDto } from "./api.js";

/**
 * Seuils du voyant de marge réelle — confirmé le 17 août 2026. S'appliquent
 * immédiatement à projets, roulements et calls (recalculé à la lecture à
 * chaque punch/achat, jamais un champ figé sur l'entité — voir
 * financialStatus, packages/business-rules/margin.ts).
 */
export function MarginThresholdsCard() {
  const queryClient = useQueryClient();
  const thresholdsQuery = useQuery({ queryKey: ["margin-thresholds"], queryFn: fetchMarginThresholds });
  // Brouillon local, nul tant que l'utilisateur n'a rien tapé — même patron
  // que PurchaseCategoriesCard (draftFor) : pas de useEffect pour copier les
  // données serveur dans un state local au montage.
  const [draft, setDraft] = useState<MarginThresholdsDto | null>(null);

  const conforme = String(draft?.conformeThreshold ?? thresholdsQuery.data?.thresholds?.conformeThreshold ?? "");
  const atRisk = String(draft?.atRiskThreshold ?? thresholdsQuery.data?.thresholds?.atRiskThreshold ?? "");

  const saveMutation = useMutation({
    mutationFn: () => updateMarginThresholds({ conformeThreshold: Number(conforme), atRiskThreshold: Number(atRisk) }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["margin-thresholds"] }),
  });

  const valid = conforme.trim().length > 0 && atRisk.trim().length > 0;

  return (
    <div className="card" style={{ marginTop: 20 }}>
      <h2 style={{ marginTop: 0, fontSize: 16 }}>Seuils du voyant de marge réelle</h2>
      <p style={{ color: "var(--gsc-color-muted)", fontSize: 13, marginTop: -8 }}>
        Ces seuils s'appliquent immédiatement aux projets, roulements et calls.
      </p>

      <div className="form-grid">
        <div className="field">
          <label>Conforme à partir de</label>
          <input
            type="number"
            min={0}
            max={100}
            step="0.1"
            value={conforme}
            onChange={(event) => setDraft({ conformeThreshold: Number(event.target.value), atRiskThreshold: Number(atRisk) })}
          />
        </div>
        <div className="field">
          <label>À risque à partir de</label>
          <input
            type="number"
            min={0}
            max={100}
            step="0.1"
            value={atRisk}
            onChange={(event) => setDraft({ conformeThreshold: Number(conforme), atRiskThreshold: Number(event.target.value) })}
          />
        </div>
      </div>

      <button type="button" className="btn" disabled={!valid || saveMutation.isPending} onClick={() => saveMutation.mutate()}>
        Enregistrer les seuils
      </button>
    </div>
  );
}
