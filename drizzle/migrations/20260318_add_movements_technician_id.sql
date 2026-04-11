ALTER TABLE "movements"
ADD COLUMN IF NOT EXISTS "technicianId" TEXT;

CREATE INDEX IF NOT EXISTS "movements_technicianId_idx" ON "movements"("technicianId");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'movements_technicianId_fkey'
  ) THEN
    ALTER TABLE "movements"
    ADD CONSTRAINT "movements_technicianId_fkey"
    FOREIGN KEY ("technicianId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
