import { useQuery } from "@tanstack/react-query";
import { fetchCompanyLetterhead } from "../lib/companyLetterhead.js";
import logo from "../assets/gsc-logo.png";

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
 *
 * Gabarit visuel (15 novembre 2026, co-conçu avec Marie — voir CLAUDE.md) :
 * logo réel (apps/web/src/assets/gsc-logo.png, fourni par Marie) ajouté ;
 * No d'entreprise/TPS/TVQ retirés d'ici et déplacés au pied de page de
 * chaque document (SoumissionExportView.tsx) — ce bloc-ci ne sert plus
 * que l'identité visuelle (logo + nom + coordonnées), jamais les numéros
 * d'inscription.
 */
export function CompanyLetterhead() {
  const { data } = useQuery({ queryKey: ["company-letterhead"], queryFn: fetchCompanyLetterhead });
  const identity = data?.identity;

  return (
    <div className="pdf-export-company">
      <img src={logo} alt="GSC Automation" className="pdf-export-company-logo" />
      <div>
        <strong className="pdf-export-company-name">{identity?.companyLegalName || "GSC Automation"}</strong>
        {identity?.companyAddress && <div className="pdf-export-company-line">{identity.companyAddress}</div>}
        {(identity?.companyPhone || identity?.companyEmail || identity?.companyWebsite) && (
          <div className="pdf-export-company-line">
            {[identity?.companyPhone, identity?.companyEmail, identity?.companyWebsite].filter(Boolean).join(" · ")}
          </div>
        )}
      </div>
    </div>
  );
}
