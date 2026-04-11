CREATE TABLE "productStocks" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "baseId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "productStocks_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "productStocks_productId_baseId_unique" ON "productStocks"("productId", "baseId");
CREATE INDEX "productStocks_productId_idx" ON "productStocks"("productId");
CREATE INDEX "productStocks_baseId_idx" ON "productStocks"("baseId");

ALTER TABLE "productStocks"
ADD CONSTRAINT "productStocks_productId_fkey"
FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "productStocks"
ADD CONSTRAINT "productStocks_baseId_fkey"
FOREIGN KEY ("baseId") REFERENCES "Base"("id") ON DELETE CASCADE ON UPDATE CASCADE;

DO $$
BEGIN
  IF to_regclass('"Stock"') IS NOT NULL THEN
    INSERT INTO "productStocks" ("id", "productId", "baseId", "quantity", "createdAt", "updatedAt")
    SELECT "id", "productId", "baseId", "quantity", "createdAt", "updatedAt"
    FROM "Stock"
    ON CONFLICT ("productId", "baseId") DO NOTHING;
  END IF;
END $$;
