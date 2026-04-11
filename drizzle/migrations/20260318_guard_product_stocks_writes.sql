CREATE OR REPLACE FUNCTION "enforce_product_stocks_stock_service_guard"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF current_setting('app.stock_service_write', true) IS DISTINCT FROM 'on' THEN
    RAISE EXCEPTION 'Direct writes to productStocks are forbidden; use stockService';
  END IF;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS "productStocks_write_guard" ON "productStocks";

CREATE TRIGGER "productStocks_write_guard"
BEFORE INSERT OR UPDATE OR DELETE ON "productStocks"
FOR EACH ROW
EXECUTE FUNCTION "enforce_product_stocks_stock_service_guard"();
