import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "../lib/apiClient.js";

interface CompanyLetterheadData {
  companyLegalName: string | null;
  companyAddress: string | null;
  companyPhone: string | null;
  companyEmail: string | null;
  companyTpsNumber: string | null;
  companyTvqNumber: string | null;
}

function fetchCompanyLetterhead(): Promise<{ identity: CompanyLetterheadData }> {
  return apiFetch("/api/settings/company-letterhead");
}

/**
 * En-tête d'entreprise partagé (13 novembre 2026) — premières vues
 * d'export à en avoir besoin (Soumission/Confirmation de commande/
 * Facture) : partagé dès le départ plutôt que dupliqué 3 fois, puisque ce
 * bloc n'existait pas avant ce chantier (contrairement au reste du
 * patron *ExportView.tsx, répliqué à l'identique ailleurs par convention
 * établie — rien de risqué à partager du code neuf). Lit Settings via
 * /settings/company-letterhead (hors de la porte Direction seulement du
 * reste de Paramètres — voir settings/routes.ts, toute personne pouvant
 * imprimer un de ces documents en a besoin). Repli sur "GSC Automation"
 * tant que Marie n'a pas rempli la carte Paramètres — même littéral déjà
 * utilisé en dur dans les vues d'export plus anciennes, jamais une
 * nouvelle valeur inventée.
 */
export function CompanyLetterhead() {
  const { data } = useQuery({ queryKey: ["company-letterhead"], queryFn: fetchCompanyLetterhead });
  const identity = data?.identity;

  return (
    <div className="pdf-export-company">
      <strong>{identity?.companyLegalName || "GSC Automation"}</strong>
      {identity?.companyAddress && <div>{identity.companyAddress}</div>}
      {(identity?.companyPhone || identity?.companyEmail) && (
        <div>
          {identity?.companyPhone}
          {identity?.companyPhone && identity?.companyEmail && " · "}
          {identity?.companyEmail}
        </div>
      )}
      {(identity?.companyTpsNumber || identity?.companyTvqNumber) && (
        <div style={{ fontSize: 11, color: "var(--gsc-color-muted)" }}>
          {identity?.companyTpsNumber && <>TPS : {identity.companyTpsNumber}</>}
          {identity?.companyTpsNumber && identity?.companyTvqNumber && " · "}
          {identity?.companyTvqNumber && <>TVQ : {identity.companyTvqNumber}</>}
        </div>
      )}
    </div>
  );
}
