-- CreateTable
CREATE TABLE "CategoryBaseAccess" (
    "id" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,
    "baseId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CategoryBaseAccess_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductBaseAccess" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "baseId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProductBaseAccess_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CategoryBaseAccess_categoryId_baseId_key" ON "CategoryBaseAccess"("categoryId", "baseId");

-- CreateIndex
CREATE INDEX "CategoryBaseAccess_baseId_idx" ON "CategoryBaseAccess"("baseId");

-- CreateIndex
CREATE UNIQUE INDEX "ProductBaseAccess_productId_baseId_key" ON "ProductBaseAccess"("productId", "baseId");

-- CreateIndex
CREATE INDEX "ProductBaseAccess_baseId_idx" ON "ProductBaseAccess"("baseId");

-- AddForeignKey
ALTER TABLE "CategoryBaseAccess" ADD CONSTRAINT "CategoryBaseAccess_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CategoryBaseAccess" ADD CONSTRAINT "CategoryBaseAccess_baseId_fkey" FOREIGN KEY ("baseId") REFERENCES "Base"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductBaseAccess" ADD CONSTRAINT "ProductBaseAccess_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductBaseAccess" ADD CONSTRAINT "ProductBaseAccess_baseId_fkey" FOREIGN KEY ("baseId") REFERENCES "Base"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Seed existing categories with all company bases
INSERT INTO "CategoryBaseAccess" ("id", "categoryId", "baseId", "createdAt")
SELECT
  md5(random()::text || clock_timestamp()::text || c."id" || b."id") AS "id",
  c."id" AS "categoryId",
  b."id" AS "baseId",
  CURRENT_TIMESTAMP AS "createdAt"
FROM "Category" c
INNER JOIN "Base" b ON b."companyId" = c."companyId"
ON CONFLICT ("categoryId", "baseId") DO NOTHING;

-- Seed existing products with all company bases
INSERT INTO "ProductBaseAccess" ("id", "productId", "baseId", "createdAt")
SELECT
  md5(random()::text || clock_timestamp()::text || p."id" || b."id") AS "id",
  p."id" AS "productId",
  b."id" AS "baseId",
  CURRENT_TIMESTAMP AS "createdAt"
FROM "Product" p
INNER JOIN "Base" b ON b."companyId" = p."companyId"
ON CONFLICT ("productId", "baseId") DO NOTHING;
