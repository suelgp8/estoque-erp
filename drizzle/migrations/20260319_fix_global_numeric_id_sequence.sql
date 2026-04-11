DO $$
DECLARE
  max_numeric_id BIGINT := 100000;
  current_max BIGINT;
BEGIN
  IF to_regclass('"Company"') IS NOT NULL THEN
    EXECUTE 'SELECT GREATEST($1, COALESCE(MAX("id"::bigint), 100000)) FROM "Company" WHERE "id" ~ ''^\d+$'''
      INTO current_max
      USING max_numeric_id;
    max_numeric_id := current_max;
  END IF;

  IF to_regclass('"User"') IS NOT NULL THEN
    EXECUTE 'SELECT GREATEST($1, COALESCE(MAX("id"::bigint), 100000)) FROM "User" WHERE "id" ~ ''^\d+$'''
      INTO current_max
      USING max_numeric_id;
    max_numeric_id := current_max;
  END IF;

  IF to_regclass('"Base"') IS NOT NULL THEN
    EXECUTE 'SELECT GREATEST($1, COALESCE(MAX("id"::bigint), 100000)) FROM "Base" WHERE "id" ~ ''^\d+$'''
      INTO current_max
      USING max_numeric_id;
    max_numeric_id := current_max;
  END IF;

  IF to_regclass('"SystemConfig"') IS NOT NULL THEN
    EXECUTE 'SELECT GREATEST($1, COALESCE(MAX("id"::bigint), 100000)) FROM "SystemConfig" WHERE "id" ~ ''^\d+$'''
      INTO current_max
      USING max_numeric_id;
    max_numeric_id := current_max;
  END IF;

  IF to_regclass('"Category"') IS NOT NULL THEN
    EXECUTE 'SELECT GREATEST($1, COALESCE(MAX("id"::bigint), 100000)) FROM "Category" WHERE "id" ~ ''^\d+$'''
      INTO current_max
      USING max_numeric_id;
    max_numeric_id := current_max;
  END IF;

  IF to_regclass('"Product"') IS NOT NULL THEN
    EXECUTE 'SELECT GREATEST($1, COALESCE(MAX("id"::bigint), 100000)) FROM "Product" WHERE "id" ~ ''^\d+$'''
      INTO current_max
      USING max_numeric_id;
    max_numeric_id := current_max;
  END IF;

  IF to_regclass('"CategoryBaseAccess"') IS NOT NULL THEN
    EXECUTE 'SELECT GREATEST($1, COALESCE(MAX("id"::bigint), 100000)) FROM "CategoryBaseAccess" WHERE "id" ~ ''^\d+$'''
      INTO current_max
      USING max_numeric_id;
    max_numeric_id := current_max;
  END IF;

  IF to_regclass('"ProductBaseAccess"') IS NOT NULL THEN
    EXECUTE 'SELECT GREATEST($1, COALESCE(MAX("id"::bigint), 100000)) FROM "ProductBaseAccess" WHERE "id" ~ ''^\d+$'''
      INTO current_max
      USING max_numeric_id;
    max_numeric_id := current_max;
  END IF;

  IF to_regclass('"Stock"') IS NOT NULL THEN
    EXECUTE 'SELECT GREATEST($1, COALESCE(MAX("id"::bigint), 100000)) FROM "Stock" WHERE "id" ~ ''^\d+$'''
      INTO current_max
      USING max_numeric_id;
    max_numeric_id := current_max;
  END IF;

  IF to_regclass('"StockMovement"') IS NOT NULL THEN
    EXECUTE 'SELECT GREATEST($1, COALESCE(MAX("id"::bigint), 100000)) FROM "StockMovement" WHERE "id" ~ ''^\d+$'''
      INTO current_max
      USING max_numeric_id;
    max_numeric_id := current_max;
  END IF;

  IF to_regclass('"StockMovementItem"') IS NOT NULL THEN
    EXECUTE 'SELECT GREATEST($1, COALESCE(MAX("id"::bigint), 100000)) FROM "StockMovementItem" WHERE "id" ~ ''^\d+$'''
      INTO current_max
      USING max_numeric_id;
    max_numeric_id := current_max;
  END IF;

  IF to_regclass('"Log"') IS NOT NULL THEN
    EXECUTE 'SELECT GREATEST($1, COALESCE(MAX("id"::bigint), 100000)) FROM "Log" WHERE "id" ~ ''^\d+$'''
      INTO current_max
      USING max_numeric_id;
    max_numeric_id := current_max;
  END IF;

  IF to_regclass('"PasswordResetToken"') IS NOT NULL THEN
    EXECUTE 'SELECT GREATEST($1, COALESCE(MAX("id"::bigint), 100000)) FROM "PasswordResetToken" WHERE "id" ~ ''^\d+$'''
      INTO current_max
      USING max_numeric_id;
    max_numeric_id := current_max;
  END IF;

  IF to_regclass('"UserBaseAccess"') IS NOT NULL THEN
    EXECUTE 'SELECT GREATEST($1, COALESCE(MAX("id"::bigint), 100000)) FROM "UserBaseAccess" WHERE "id" ~ ''^\d+$'''
      INTO current_max
      USING max_numeric_id;
    max_numeric_id := current_max;
  END IF;

  IF to_regclass('"productStocks"') IS NOT NULL THEN
    EXECUTE 'SELECT GREATEST($1, COALESCE(MAX("id"::bigint), 100000)) FROM "productStocks" WHERE "id" ~ ''^\d+$'''
      INTO current_max
      USING max_numeric_id;
    max_numeric_id := current_max;
  END IF;

  IF to_regclass('"movements"') IS NOT NULL THEN
    EXECUTE 'SELECT GREATEST($1, COALESCE(MAX("id"::bigint), 100000)) FROM "movements" WHERE "id" ~ ''^\d+$'''
      INTO current_max
      USING max_numeric_id;
    max_numeric_id := current_max;
  END IF;

  PERFORM setval('app_numeric_id_seq', max_numeric_id, true);
END $$;
