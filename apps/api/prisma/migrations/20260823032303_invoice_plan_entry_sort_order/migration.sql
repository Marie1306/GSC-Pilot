-- AlterTable
ALTER TABLE "InvoicePlanEntry" ADD COLUMN     "sortOrder" INTEGER NOT NULL DEFAULT 0;

-- Backfill : les jalons déjà existants n'ont aucun ordre explicite au moment
-- de cette migration (le nouveau défaut 0 les mettrait tous à égalité, ce
-- qui reproduirait exactement le bug corrigé ici). Départage par ctid
-- (position physique de la ligne, PAS id) : plusieurs jalons créés dans le
-- même createMany partagent le même createdAt à la microseconde près, donc
-- createdAt seul ne départage rien — mais un uuid (id) n'a de son côté
-- aucun lien avec l'ordre réel d'insertion (aléatoire), départager par id
-- ré-ordonnerait ces jalons au hasard plutôt que dans l'ordre voulu
-- (Après conception, Livraison, etc., voir DEFAULT_BILLING_SPLIT/
-- Settings.defaultBillingSplit). ctid reflète l'ordre physique d'insertion
-- — exactement l'ordre d'origine du createMany — tant qu'aucun VACUUM FULL
-- n'a réécrit la table depuis (vérifié : aucun exécuté sur cette table).
WITH ranked AS (
  SELECT "id", ROW_NUMBER() OVER (
    PARTITION BY COALESCE("projectId", "rollingId", "serviceCallId")
    ORDER BY "createdAt" ASC, ctid ASC
  ) - 1 AS rn
  FROM "InvoicePlanEntry"
)
UPDATE "InvoicePlanEntry" AS e
SET "sortOrder" = ranked.rn
FROM ranked
WHERE e."id" = ranked."id";
