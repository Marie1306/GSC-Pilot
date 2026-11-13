import { apiFetch } from "./apiClient.js";

export interface CompanyLetterheadDto {
  companyLegalName: string | null;
  companyAddress: string | null;
  companyPhone: string | null;
  companyEmail: string | null;
  companyWebsite: string | null;
  companyBusinessNumber: string | null;
  companyTpsNumber: string | null;
  companyTvqNumber: string | null;
  soumissionDefaultNote: string | null;
}

/**
 * Partagé entre CompanyLetterhead.tsx (en-tête des vues d'export) et les
 * fenêtres de composition de document (ex. PrepareSoumissionModal.tsx, pour
 * pré-remplir la note légale standard) — un seul point de vérité pour cette
 * route hors de la porte Direction seulement du reste de Paramètres (voir
 * settings/routes.ts, GET /settings/company-letterhead).
 */
export function fetchCompanyLetterhead(): Promise<{ identity: CompanyLetterheadDto }> {
  return apiFetch("/api/settings/company-letterhead");
}
