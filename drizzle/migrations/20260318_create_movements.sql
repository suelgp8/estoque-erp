CREATE TABLE "movements" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "fromBaseId" TEXT,
    "toBaseId" TEXT,
    "quantity" INTEGER NOT NULL,
    "type" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "movements_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "movements_productId_idx" ON "movements"("productId");
CREATE INDEX "movements_fromBaseId_idx" ON "movements"("fromBaseId");
CREATE INDEX "movements_toBaseId_idx" ON "movements"("toBaseId");
CREATE INDEX "movements_type_idx" ON "movements"("type");

ALTER TABLE "movements"
ADD CONSTRAINT "movements_productId_fkey"
FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "movements"
ADD CONSTRAINT "movements_fromBaseId_fkey"
FOREIGN KEY ("fromBaseId") REFERENCES "Base"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "movements"
ADD CONSTRAINT "movements_toBaseId_fkey"
FOREIGN KEY ("toBaseId") REFERENCES "Base"("id") ON DELETE SET NULL ON UPDATE CASCADE;
