import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { fetchCompanyIdentity, updateCompanyIdentity, type CompanyIdentityDto } from "./api.js";

const EMPTY: CompanyIdentityDto = {
  companyLegalName: "",
  companyAddress: "",
  companyPhone: "",
  companyEmail: "",
  companyTpsNumber: "",
  companyTvqNumber: "",
};

/**
 * Identité de l'entreprise pour l'en-tête des documents client (Soumission/
 * Confirmation de commande/Facture — 13 novembre 2026). Vide par défaut,
 * jamais une valeur devinée — "GSC Automation" était codé en dur dans
 * chaque vue d'export avant ce chantier, sans adresse ni numéros
 * d'inscription TPS/TVQ (requis légalement sur un document client
 * québécois). Lue par toute personne pouvant imprimer un de ces documents
 * (GET /settings/company-letterhead, hors de la porte Direction seulement
 * du reste de Paramètres) — seule l'édition ici reste Direction seulement.
 */
export function CompanyIdentityCard() {
  const queryClient = useQueryClient();
  const identityQuery = useQuery({ queryKey: ["company-identity"], queryFn: fetchCompanyIdentity });
  const [draft, setDraft] = useState<CompanyIdentityDto | null>(null);

  const current = draft ?? identityQuery.data?.identity ?? EMPTY;

  function set<K extends keyof CompanyIdentityDto>(key: K, value: string) {
    setDraft({ ...current, [key]: value });
  }

  const saveMutation = useMutation({
    mutationFn: () => updateCompanyIdentity(current),
    onSuccess: () => {
      setDraft(null);
      void queryClient.invalidateQueries({ queryKey: ["company-identity"] });
    },
  });

  return (
    <div className="card" style={{ marginTop: 20 }}>
      <div className="card-band-header">
        <div>
          <h3>Identité de l'entreprise</h3>
          <p className="modal-subtitle">
            Affichée sur les Soumissions, Confirmations de commande et Factures imprimées — les numéros d'inscription TPS/TVQ sont requis sur un
            document client québécois.
          </p>
        </div>
      </div>

      <div className="form-grid">
        <div className="field field-full">
          <label>Nom légal</label>
          <input type="text" value={current.companyLegalName ?? ""} onChange={(e) => set("companyLegalName", e.target.value)} />
        </div>
        <div className="field field-full">
          <label>Adresse</label>
          <input type="text" value={current.companyAddress ?? ""} onChange={(e) => set("companyAddress", e.target.value)} />
        </div>
        <div className="field">
          <label>Téléphone</label>
          <input type="text" value={current.companyPhone ?? ""} onChange={(e) => set("companyPhone", e.target.value)} />
        </div>
        <div className="field">
          <label>Courriel</label>
          <input type="text" value={current.companyEmail ?? ""} onChange={(e) => set("companyEmail", e.target.value)} />
        </div>
        <div className="field">
          <label>Numéro d'inscription TPS</label>
          <input type="text" value={current.companyTpsNumber ?? ""} onChange={(e) => set("companyTpsNumber", e.target.value)} />
        </div>
        <div className="field">
          <label>Numéro d'inscription TVQ</label>
          <input type="text" value={current.companyTvqNumber ?? ""} onChange={(e) => set("companyTvqNumber", e.target.value)} />
        </div>
      </div>

      <button type="button" className="btn" disabled={saveMutation.isPending} onClick={() => saveMutation.mutate()}>
        {saveMutation.isPending ? "…" : "Enregistrer l'identité de l'entreprise"}
      </button>
    </div>
  );
}
