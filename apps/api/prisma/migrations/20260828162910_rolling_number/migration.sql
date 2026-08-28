-- AlterTable
ALTER TABLE "Settings" ADD COLUMN     "nextRollingNumber" INTEGER NOT NULL DEFAULT 1;

-- AlterTable (nullable d'abord — Rolling a déjà des lignes, backfill ci-dessous avant le NOT NULL)
ALTER TABLE "Rolling" ADD COLUMN     "rollingNumber" TEXT;

-- Backfill déterministe des lignes existantes : RL-<année de création>-NNNN,
-- numéroté par ordre de création (jamais deviné — reflète l'ordre réel).
WITH numbered AS (
  SELECT id, "createdAt", ROW_NUMBER() OVER (ORDER BY "createdAt") AS rn
  FROM "Rolling"
)
UPDATE "Rolling" r
SET "rollingNumber" = 'RL-' || EXTRACT(YEAR FROM numbered."createdAt")::text || '-' || LPAD(numbered.rn::text, 4, '0')
FROM numbered
WHERE r.id = numbered.id;

-- Fait avancer le compteur pour ne jamais réutiliser un numéro déjà backfillé.
UPDATE "Settings" SET "nextRollingNumber" = (SELECT COUNT(*) FROM "Rolling") + 1;

-- AlterTable
ALTER TABLE "Rolling" ALTER COLUMN "rollingNumber" SET NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "Rolling_rollingNumber_key" ON "Rolling"("rollingNumber");
