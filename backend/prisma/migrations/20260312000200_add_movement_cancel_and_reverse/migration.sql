ALTER TYPE "StockMovementStatus" ADD VALUE 'CANCELED';
ALTER TYPE "StockMovementStatus" ADD VALUE 'REVERSED';

ALTER TABLE "StockMovement"
ADD COLUMN "cancellationReason" TEXT,
ADD COLUMN "reversalReason" TEXT,
ADD COLUMN "originalMovementId" TEXT;

CREATE UNIQUE INDEX "StockMovement_originalMovementId_key" ON "StockMovement"("originalMovementId");

ALTER TABLE "StockMovement"
ADD CONSTRAINT "StockMovement_originalMovementId_fkey"
FOREIGN KEY ("originalMovementId") REFERENCES "StockMovement"("id") ON DELETE SET NULL ON UPDATE CASCADE;
