import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { fetchServiceRates, updateServiceRates, type ServiceRatesDto } from "./api.js";
import "./settings.css";

type Draft = Record<keyof ServiceRatesDto, string>;

function draftFrom(rates: ServiceRatesDto): Draft {
  return {
    mileageRate: String(rates.mileageRate),
    breakfastRate: String(rates.breakfastRate),
    lunchRate: String(rates.lunchRate),
    dinnerRate: String(rates.dinnerRate),
    servicePartsDefaultMarginPct: String(rates.servicePartsDefaultMarginPct),
    urgencyFee: String(rates.urgencyFee),
  };
}

/**
 * Complète TechLevelsCard (matrice Régulier/Temps sup./Extra par classe) —
 * les autres taux du call de service : kilométrage/repas (déjà lus par
 * serviceCallExpenseTotal), marge sur les pièces (saleFromCost) et frais
 * d'urgence (nouveau, confirmé le 20 août 2026 — stocké seulement, jamais
 * appliqué automatiquement : aucun indicateur "urgent" n'existe encore sur
 * un call de service).
 */
export function ServiceRatesCard() {
  const queryClient = useQueryClient();
  const ratesQuery = useQuery({ queryKey: ["service-rates"], queryFn: fetchServiceRates });
  const [draftOverride, setDraftOverride] = useState<Draft | null>(null);

  const saveMutation = useMutation({
    mutationFn: (update: Partial<ServiceRatesDto>) => updateServiceRates(update),
    onSuccess: (result) => {
      setDraftOverride(draftFrom(result.rates));
      void queryClient.invalidateQueries({ queryKey: ["service-rates"] });
    },
  });

  if (!ratesQuery.data) return null;
  const draft = draftOverride ?? draftFrom(ratesQuery.data.rates);

  function setField(field: keyof ServiceRatesDto, value: string) {
    setDraftOverride({ ...draft, [field]: value });
  }

  function save() {
    if (!draft) return;
    saveMutation.mutate({
      mileageRate: Number(draft.mileageRate),
      breakfastRate: Number(draft.breakfastRate),
      lunchRate: Number(draft.lunchRate),
      dinnerRate: Number(draft.dinnerRate),
      servicePartsDefaultMarginPct: Number(draft.servicePartsDefaultMarginPct),
      urgencyFee: Number(draft.urgencyFee),
    });
  }

  const valid = Object.values(draft).every((value) => value.trim().length > 0 && Number(value) >= 0);

  return (
    <div className="card" style={{ marginTop: 20 }}>
      <div className="card-band-header">
        <div>
          <h3>Tarifs de calls de service et pièces</h3>
          <p className="modal-subtitle">
            Modifiables par la Direction; invisibles aux employés. Complète les classes de service (Régulier/Temps sup./Extra) ci-dessus.
          </p>
        </div>
      </div>

      <div className="form-grid" style={{ marginTop: 12 }}>
        <div className="field">
          <label>Frais d'urgence ($)</label>
          <input type="number" min={0} step="0.01" value={draft.urgencyFee} onChange={(event) => setField("urgencyFee", event.target.value)} />
        </div>
        <div className="field">
          <label>Marge de profit sur les pièces (%)</label>
          <input
            type="number"
            min={0}
            step="0.01"
            value={draft.servicePartsDefaultMarginPct}
            onChange={(event) => setField("servicePartsDefaultMarginPct", event.target.value)}
          />
        </div>
        <div className="field">
          <label>Prix du kilomètre ($/km)</label>
          <input type="number" min={0} step="0.01" value={draft.mileageRate} onChange={(event) => setField("mileageRate", event.target.value)} />
        </div>
        <div className="field">
          <label>Déjeuner ($)</label>
          <input type="number" min={0} step="0.01" value={draft.breakfastRate} onChange={(event) => setField("breakfastRate", event.target.value)} />
        </div>
        <div className="field">
          <label>Dîner ($)</label>
          <input type="number" min={0} step="0.01" value={draft.lunchRate} onChange={(event) => setField("lunchRate", event.target.value)} />
        </div>
        <div className="field">
          <label>Souper ($)</label>
          <input type="number" min={0} step="0.01" value={draft.dinnerRate} onChange={(event) => setField("dinnerRate", event.target.value)} />
        </div>
      </div>

      <button type="button" className="btn" disabled={!valid || saveMutation.isPending} onClick={save}>
        {saveMutation.isPending ? "Enregistrement…" : "Enregistrer les tarifs"}
      </button>
    </div>
  );
}
