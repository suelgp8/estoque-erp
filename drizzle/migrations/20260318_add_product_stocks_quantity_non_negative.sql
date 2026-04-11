DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "productStocks"
    WHERE "quantity" < 0
  ) THEN
    RAISE EXCEPTION 'Cannot add constraint productStocks_quantity_non_negative while negative stock rows exist';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'productStocks_quantity_non_negative'
  ) THEN
    ALTER TABLE "productStocks"
    ADD CONSTRAINT "productStocks_quantity_non_negative"
    CHECK ("quantity" >= 0);
  END IF;
END $$;
