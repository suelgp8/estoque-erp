CREATE SEQUENCE IF NOT EXISTS "app_numeric_id_seq"
  AS BIGINT
  START WITH 100000
  INCREMENT BY 1
  MINVALUE 100000;

CREATE SEQUENCE IF NOT EXISTS "app_sku_seq"
  AS BIGINT
  START WITH 10000000
  INCREMENT BY 1
  MINVALUE 10000000;

DO $$
DECLARE
  max_numeric_id BIGINT;
  max_numeric_sku BIGINT;
  product_stocks_max BIGINT := 0;
  movements_max BIGINT := 0;
BEGIN
  IF to_regclass('"productStocks"') IS NOT NULL THEN
    EXECUTE 'SELECT COALESCE(MAX("id"::bigint), 0) FROM "productStocks" WHERE "id" ~ ''^\d+$'''
      INTO product_stocks_max;
  END IF;

  IF to_regclass('"movements"') IS NOT NULL THEN
    EXECUTE 'SELECT COALESCE(MAX("id"::bigint), 0) FROM "movements" WHERE "id" ~ ''^\d+$'''
      INTO movements_max;
  END IF;

  SELECT GREATEST(
    COALESCE((SELECT MAX("id"::bigint) FROM "Company" WHERE "id" ~ '^\d+$'), 0),
    COALESCE((SELECT MAX("id"::bigint) FROM "User" WHERE "id" ~ '^\d+$'), 0),
    COALESCE((SELECT MAX("id"::bigint) FROM "Base" WHERE "id" ~ '^\d+$'), 0),
    COALESCE((SELECT MAX("id"::bigint) FROM "SystemConfig" WHERE "id" ~ '^\d+$'), 0),
    COALESCE((SELECT MAX("id"::bigint) FROM "Category" WHERE "id" ~ '^\d+$'), 0),
    COALESCE((SELECT MAX("id"::bigint) FROM "Product" WHERE "id" ~ '^\d+$'), 0),
    COALESCE((SELECT MAX("id"::bigint) FROM "CategoryBaseAccess" WHERE "id" ~ '^\d+$'), 0),
    COALESCE((SELECT MAX("id"::bigint) FROM "ProductBaseAccess" WHERE "id" ~ '^\d+$'), 0),
    COALESCE((SELECT MAX("id"::bigint) FROM "Stock" WHERE "id" ~ '^\d+$'), 0),
    COALESCE((SELECT MAX("id"::bigint) FROM "StockMovement" WHERE "id" ~ '^\d+$'), 0),
    COALESCE((SELECT MAX("id"::bigint) FROM "StockMovementItem" WHERE "id" ~ '^\d+$'), 0),
    COALESCE((SELECT MAX("id"::bigint) FROM "Log" WHERE "id" ~ '^\d+$'), 0),
    COALESCE((SELECT MAX("id"::bigint) FROM "PasswordResetToken" WHERE "id" ~ '^\d+$'), 0),
    COALESCE((SELECT MAX("id"::bigint) FROM "UserBaseAccess" WHERE "id" ~ '^\d+$'), 0),
    product_stocks_max,
    movements_max,
    100000
  )
  INTO max_numeric_id;

  SELECT GREATEST(
    COALESCE((SELECT MAX("sku"::bigint) FROM "Product" WHERE "sku" ~ '^\d+$'), 0),
    10000000
  )
  INTO max_numeric_sku;

  PERFORM setval('app_numeric_id_seq', max_numeric_id, true);
  PERFORM setval('app_sku_seq', max_numeric_sku, true);
END $$;

ALTER TABLE "Company" ALTER COLUMN "id" SET DEFAULT nextval('app_numeric_id_seq'::regclass)::text;
ALTER TABLE "User" ALTER COLUMN "id" SET DEFAULT nextval('app_numeric_id_seq'::regclass)::text;
ALTER TABLE "Base" ALTER COLUMN "id" SET DEFAULT nextval('app_numeric_id_seq'::regclass)::text;
ALTER TABLE "SystemConfig" ALTER COLUMN "id" SET DEFAULT nextval('app_numeric_id_seq'::regclass)::text;
ALTER TABLE "Category" ALTER COLUMN "id" SET DEFAULT nextval('app_numeric_id_seq'::regclass)::text;
ALTER TABLE "Product" ALTER COLUMN "id" SET DEFAULT nextval('app_numeric_id_seq'::regclass)::text;
ALTER TABLE "Product" ALTER COLUMN "sku" SET DEFAULT lpad(nextval('app_sku_seq'::regclass)::text, 8, '0');
ALTER TABLE "CategoryBaseAccess" ALTER COLUMN "id" SET DEFAULT nextval('app_numeric_id_seq'::regclass)::text;
ALTER TABLE "ProductBaseAccess" ALTER COLUMN "id" SET DEFAULT nextval('app_numeric_id_seq'::regclass)::text;
ALTER TABLE "Stock" ALTER COLUMN "id" SET DEFAULT nextval('app_numeric_id_seq'::regclass)::text;
ALTER TABLE "StockMovement" ALTER COLUMN "id" SET DEFAULT nextval('app_numeric_id_seq'::regclass)::text;
ALTER TABLE "StockMovementItem" ALTER COLUMN "id" SET DEFAULT nextval('app_numeric_id_seq'::regclass)::text;
ALTER TABLE "Log" ALTER COLUMN "id" SET DEFAULT nextval('app_numeric_id_seq'::regclass)::text;
ALTER TABLE "PasswordResetToken" ALTER COLUMN "id" SET DEFAULT nextval('app_numeric_id_seq'::regclass)::text;
ALTER TABLE "UserBaseAccess" ALTER COLUMN "id" SET DEFAULT nextval('app_numeric_id_seq'::regclass)::text;

DO $$
BEGIN
  IF to_regclass('"productStocks"') IS NOT NULL THEN
    EXECUTE 'ALTER TABLE "productStocks" ALTER COLUMN "id" SET DEFAULT nextval(''app_numeric_id_seq''::regclass)::text';
  END IF;

  IF to_regclass('"movements"') IS NOT NULL THEN
    EXECUTE 'ALTER TABLE "movements" ALTER COLUMN "id" SET DEFAULT nextval(''app_numeric_id_seq''::regclass)::text';
  END IF;
END $$;
