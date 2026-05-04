-- CreateTable
CREATE TABLE "UserBaseAccess" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "baseId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserBaseAccess_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "UserBaseAccess_userId_baseId_key" ON "UserBaseAccess"("userId", "baseId");

-- CreateIndex
CREATE INDEX "UserBaseAccess_baseId_idx" ON "UserBaseAccess"("baseId");

-- AddForeignKey
ALTER TABLE "UserBaseAccess" ADD CONSTRAINT "UserBaseAccess_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserBaseAccess" ADD CONSTRAINT "UserBaseAccess_baseId_fkey" FOREIGN KEY ("baseId") REFERENCES "Base"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Seed existing GESTOR users with all company bases
INSERT INTO "UserBaseAccess" ("id", "userId", "baseId", "createdAt")
SELECT
  md5(random()::text || clock_timestamp()::text || u."id" || b."id") AS "id",
  u."id" AS "userId",
  b."id" AS "baseId",
  CURRENT_TIMESTAMP AS "createdAt"
FROM "User" u
INNER JOIN "Base" b ON b."companyId" = u."companyId"
WHERE u."role" = 'GESTOR'
ON CONFLICT ("userId", "baseId") DO NOTHING;

-- Seed existing TECNICO users with one base (oldest company base)
INSERT INTO "UserBaseAccess" ("id", "userId", "baseId", "createdAt")
SELECT
  md5(random()::text || clock_timestamp()::text || u."id" || b."id") AS "id",
  u."id" AS "userId",
  b."id" AS "baseId",
  CURRENT_TIMESTAMP AS "createdAt"
FROM "User" u
INNER JOIN LATERAL (
  SELECT "id"
  FROM "Base"
  WHERE "companyId" = u."companyId"
  ORDER BY "createdAt" ASC
  LIMIT 1
) b ON TRUE
WHERE u."role" = 'TECNICO'
ON CONFLICT ("userId", "baseId") DO NOTHING;
