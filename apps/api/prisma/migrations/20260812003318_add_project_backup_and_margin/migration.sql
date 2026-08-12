-- Prépare la conversion Budgétaire → Projet (12 août 2026, en soirée) :
-- deux champs confirmés absents du schéma Projet actuel. Aucune donnée
-- existante affectée (colonnes ajoutées avec valeur par défaut / nullables).

ALTER TABLE "Project"
  ADD COLUMN "projectBackupAmount" DECIMAL(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN "targetMarginPct" DECIMAL(5,2);
