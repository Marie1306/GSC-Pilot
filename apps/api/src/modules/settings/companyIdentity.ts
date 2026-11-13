/**
 * Paramètres — identité de l'entreprise pour l'en-tête des documents client
 * (Soumission/Confirmation de commande/Facture — 13 novembre 2026). Direction
 * seulement, comme le reste de ce module. Avant ce chantier, "GSC Automation"
 * était codé en dur dans chaque vue d'export existante, sans adresse ni
 * numéros d'inscription TPS/TVQ — tous les champs ci-dessous sont vides par
 * défaut, jamais devinés, Marie les saisit elle-même.
 */
import { prisma } from "../../db.js";
import { HttpError } from "../../middleware/errorHandler.js";

export interface CompanyIdentityDto {
  companyLegalName: string | null;
  companyAddress: string | null;
  companyPhone: string | null;
  companyEmail: string | null;
  companyTpsNumber: string | null;
  companyTvqNumber: string | null;
}

export async function getCompanyIdentity(): Promise<CompanyIdentityDto> {
  const settings = await prisma.settings.findFirst();
  if (!settings) throw new HttpError(500, "Paramètres non initialisés — lancer le seed.");
  return {
    companyLegalName: settings.companyLegalName,
    companyAddress: settings.companyAddress,
    companyPhone: settings.companyPhone,
    companyEmail: settings.companyEmail,
    companyTpsNumber: settings.companyTpsNumber,
    companyTvqNumber: settings.companyTvqNumber,
  };
}

export async function updateCompanyIdentity(update: CompanyIdentityDto): Promise<CompanyIdentityDto> {
  const settings = await prisma.settings.findFirst();
  if (!settings) throw new HttpError(500, "Paramètres non initialisés — lancer le seed.");
  const updated = await prisma.settings.update({
    where: { id: settings.id },
    data: {
      companyLegalName: update.companyLegalName?.trim() || null,
      companyAddress: update.companyAddress?.trim() || null,
      companyPhone: update.companyPhone?.trim() || null,
      companyEmail: update.companyEmail?.trim() || null,
      companyTpsNumber: update.companyTpsNumber?.trim() || null,
      companyTvqNumber: update.companyTvqNumber?.trim() || null,
    },
  });
  return {
    companyLegalName: updated.companyLegalName,
    companyAddress: updated.companyAddress,
    companyPhone: updated.companyPhone,
    companyEmail: updated.companyEmail,
    companyTpsNumber: updated.companyTpsNumber,
    companyTvqNumber: updated.companyTvqNumber,
  };
}
