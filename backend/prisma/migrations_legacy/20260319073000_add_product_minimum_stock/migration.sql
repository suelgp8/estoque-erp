ALTER TABLE "Product"
ADD COLUMN IF NOT EXISTS "minimumStock" INTEGER NOT NULL DEFAULT 0;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'Product_minimumStock_non_negative'
  ) THEN
    ALTER TABLE "Product"
    ADD CONSTRAINT "Product_minimumStock_non_negative"
    CHECK ("minimumStock" >= 0);
  END IF;
END $$;
