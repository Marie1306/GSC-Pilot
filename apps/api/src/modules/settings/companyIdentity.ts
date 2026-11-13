/**
 * Paramètres — identité de l'entreprise pour l'en-tête des documents client
 * (Soumission/Confirmation de commande/Facture — 13 novembre 2026). Direction
 * seulement, comme le reste de ce module. Avant ce chantier, "GSC Automation"
 * était codé en dur dans chaque vue d'export existante, sans adresse ni
 * numéros d'inscription TPS/TVQ — tous les champs ci-dessous sont vides par
 * défaut, jamais devinés, Marie les saisit elle-même.
 *
 * soumissionDefaultNote (14 novembre 2026) : note légale standard identique
 * sur les vraies soumissions de Marie (heures supplémentaires/matériel
 * additionnel facturés en sus) — modifiable ici, pré-remplie automatiquement
 * à la composition d'une nouvelle Soumission (PrepareSoumissionModal.tsx,
 * côté frontend), jamais imposée.
 */
import { prisma } from "../../db.js";
import { HttpError } from "../../middleware/errorHandler.js";

export interface CompanyIdentityDto {
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

export async function getCompanyIdentity(): Promise<CompanyIdentityDto> {
  const settings = await prisma.settings.findFirst();
  if (!settings) throw new HttpError(500, "Paramètres non initialisés — lancer le seed.");
  return {
    companyLegalName: settings.companyLegalName,
    companyAddress: settings.companyAddress,
    companyPhone: settings.companyPhone,
    companyEmail: settings.companyEmail,
    companyWebsite: settings.companyWebsite,
    companyBusinessNumber: settings.companyBusinessNumber,
    companyTpsNumber: settings.companyTpsNumber,
    companyTvqNumber: settings.companyTvqNumber,
    soumissionDefaultNote: settings.soumissionDefaultNote,
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
      companyWebsite: update.companyWebsite?.trim() || null,
      companyBusinessNumber: update.companyBusinessNumber?.trim() || null,
      companyTpsNumber: update.companyTpsNumber?.trim() || null,
      companyTvqNumber: update.companyTvqNumber?.trim() || null,
      soumissionDefaultNote: update.soumissionDefaultNote?.trim() || null,
    },
  });
  return {
    companyLegalName: updated.companyLegalName,
    companyAddress: updated.companyAddress,
    companyPhone: updated.companyPhone,
    companyEmail: updated.companyEmail,
    companyWebsite: updated.companyWebsite,
    companyBusinessNumber: updated.companyBusinessNumber,
    companyTpsNumber: updated.companyTpsNumber,
    companyTvqNumber: updated.companyTvqNumber,
    soumissionDefaultNote: updated.soumissionDefaultNote,
  };
}
